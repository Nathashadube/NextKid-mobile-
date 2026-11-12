/**
 * AWS Cognito Authentication Client
 * Replaces Supabase Auth with AWS Cognito User Pools
 */

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
  CognitoUserSession,
  ISignUpResult,
} from 'amazon-cognito-identity-js';
import * as SecureStore from 'expo-secure-store';

// Environment configuration - Uses same Cognito pool as web app
// Web: af-south-1_WLU6GeAmy / 6u40c3sg27jsffv9r0joeaif9s
const USER_POOL_ID = process.env.EXPO_PUBLIC_AWS_COGNITO_USER_POOL_ID!;
const CLIENT_ID = process.env.EXPO_PUBLIC_AWS_COGNITO_CLIENT_ID!;
const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'af-south-1';

// SecureStore keys
const SESSION_KEY = 'cognito_session';
const USER_DATA_KEY = 'cognito_user_data';

// Initialize Cognito User Pool
const userPool = new CognitoUserPool({
  UserPoolId: USER_POOL_ID,
  ClientId: CLIENT_ID,
});

/**
 * Session data stored in SecureStore
 */
export interface SessionData {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix timestamp
  userId: string;
  email: string;
}

/**
 * User profile data
 */
export interface UserProfile {
  id: string;
  email: string;
  email_verified: boolean;
  name?: string;
  phone_number?: string;
}

/**
 * Sign up a new user
 */
export async function signUp(
  email: string,
  password: string,
  attributes?: { name?: string; phone_number?: string }
): Promise<ISignUpResult> {
  return new Promise((resolve, reject) => {
    const attributeList: CognitoUserAttribute[] = [
      new CognitoUserAttribute({ Name: 'email', Value: email }),
    ];

    if (attributes?.name) {
      attributeList.push(
        new CognitoUserAttribute({ Name: 'name', Value: attributes.name })
      );
    }

    if (attributes?.phone_number) {
      attributeList.push(
        new CognitoUserAttribute({ Name: 'phone_number', Value: attributes.phone_number })
      );
    }

    userPool.signUp(email, password, attributeList, [], (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result!);
    });
  });
}

/**
 * Confirm sign up with verification code
 */
export async function confirmSignUp(email: string, code: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmRegistration(code, true, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/**
 * Sign in with email and password
 */
export async function signIn(email: string, password: string): Promise<SessionData> {
  return new Promise((resolve, reject) => {
    const authDetails = new AuthenticationDetails({
      Username: email,
      Password: password,
    });

    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.authenticateUser(authDetails, {
      onSuccess: async (session: CognitoUserSession) => {
        const sessionData = extractSessionData(session, email);
        await storeSession(sessionData);
        resolve(sessionData);
      },
      onFailure: (err) => {
        reject(err);
      },
      newPasswordRequired: (userAttributes) => {
        // Handle force change password scenario
        reject(new Error('NEW_PASSWORD_REQUIRED'));
      },
    });
  });
}

/**
 * Sign out current user
 */
export async function signOut(): Promise<void> {
  const currentUser = userPool.getCurrentUser();
  if (currentUser) {
    currentUser.signOut();
  }
  await SecureStore.deleteItemAsync(SESSION_KEY);
  await SecureStore.deleteItemAsync(USER_DATA_KEY);
}

/**
 * Get current session from SecureStore
 */
export async function getSession(): Promise<SessionData | null> {
  try {
    const sessionJson = await SecureStore.getItemAsync(SESSION_KEY);
    if (!sessionJson) return null;

    const session: SessionData = JSON.parse(sessionJson);

    // Check if token is expired
    if (Date.now() >= session.expiresAt) {
      // Try to refresh
      return await refreshSession(session.refreshToken);
    }

    return session;
  } catch (error) {
    console.error('Failed to get session:', error);
    return null;
  }
}

/**
 * Refresh session using refresh token
 */
export async function refreshSession(refreshToken: string): Promise<SessionData | null> {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      reject(new Error('No current user'));
      return;
    }

    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(err || new Error('No session'));
        return;
      }

      if (!session.isValid()) {
        // Session expired, need to re-authenticate
        signOut().then(() => resolve(null));
        return;
      }

      const email = session.getIdToken().payload.email || '';
      const sessionData = extractSessionData(session, email);
      
      storeSession(sessionData)
        .then(() => resolve(sessionData))
        .catch(reject);
    });
  });
}

/**
 * Get current user profile
 */
export async function getCurrentUser(): Promise<UserProfile | null> {
  const currentUser = userPool.getCurrentUser();
  if (!currentUser) return null;

  return new Promise((resolve, reject) => {
    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        resolve(null);
        return;
      }

      currentUser.getUserAttributes((err, attributes) => {
        if (err) {
          reject(err);
          return;
        }

        const profile: UserProfile = {
          id: session.getIdToken().payload.sub,
          email: session.getIdToken().payload.email || '',
          email_verified: session.getIdToken().payload.email_verified || false,
        };

        // Extract additional attributes
        attributes?.forEach((attr) => {
          if (attr.Name === 'name') profile.name = attr.Value;
          if (attr.Name === 'phone_number') profile.phone_number = attr.Value;
        });

        resolve(profile);
      });
    });
  });
}

/**
 * Request password reset
 */
export async function forgotPassword(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.forgotPassword({
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

/**
 * Confirm password reset with code
 */
export async function confirmForgotPassword(
  email: string,
  code: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.confirmPassword(code, newPassword, {
      onSuccess: () => resolve(),
      onFailure: (err) => reject(err),
    });
  });
}

/**
 * Change password for signed-in user
 */
export async function changePassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const currentUser = userPool.getCurrentUser();
    if (!currentUser) {
      reject(new Error('No current user'));
      return;
    }

    currentUser.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err || !session) {
        reject(err || new Error('No session'));
        return;
      }

      currentUser.changePassword(oldPassword, newPassword, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  });
}

/**
 * Resend verification code
 */
export async function resendConfirmationCode(email: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({
      Username: email,
      Pool: userPool,
    });

    cognitoUser.resendConfirmationCode((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

// ============================================================================
// Private Helper Functions
// ============================================================================

/**
 * Extract session data from Cognito session
 */
function extractSessionData(session: CognitoUserSession, email: string): SessionData {
  const idToken = session.getIdToken().getJwtToken();
  const accessToken = session.getAccessToken().getJwtToken();
  const refreshToken = session.getRefreshToken().getToken();
  const expiresAt = session.getAccessToken().getExpiration() * 1000; // Convert to ms
  const userId = session.getIdToken().payload.sub;

  return {
    idToken,
    accessToken,
    refreshToken,
    expiresAt,
    userId,
    email,
  };
}

/**
 * Store session in SecureStore
 */
async function storeSession(session: SessionData): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

/**
 * Validate JWT token (basic check)
 */
export function isTokenExpired(expiresAt: number): boolean {
  return Date.now() >= expiresAt;
}

/**
 * Get access token for API calls
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.accessToken || null;
}

/**
 * Auth state listener (polling-based)
 */
export function onAuthStateChange(
  callback: (session: SessionData | null) => void
): () => void {
  let intervalId: NodeJS.Timeout;
  let lastSessionState: string | null = null;

  const checkSession = async () => {
    const session = await getSession();
    const currentState = session ? JSON.stringify(session) : null;

    // Only trigger callback if state changed
    if (currentState !== lastSessionState) {
      lastSessionState = currentState;
      callback(session);
    }
  };

  // Check immediately
  checkSession();

  // Poll every 5 seconds
  intervalId = setInterval(checkSession, 5000);

  // Return cleanup function
  return () => {
    if (intervalId) clearInterval(intervalId);
  };
}
