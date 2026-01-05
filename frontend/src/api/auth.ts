import api from "../services/api";
import { setToken } from "../utils/auth";

export interface LoginData {
  username: string;
  password: string;
}

export interface LoginResponse {
  tempToken: string;
  requiresOTP: boolean;
}

export interface VerifyOTPResponse {
  token: string;
  user: any;
  profile: any;
  permissions: string[];
}

export const login = async (
  data: LoginData,
  onSuccess?: (response: LoginResponse) => void,
  onError?: (error: any) => void
): Promise<LoginResponse | void> => {
  try {
    const response = await api.post<LoginResponse>("/auth/login", data);

    if (onSuccess) {
      onSuccess(response.data);
    }

    return response.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const verifyOTP = async (
  otp: string,
  tempToken: string,
  onSuccess?: (response: VerifyOTPResponse) => void,
  onError?: (error: any) => void
): Promise<VerifyOTPResponse | void> => {
  try {
    const response = await api.post<VerifyOTPResponse>(
      "/auth/verify-otp",
      { otp },
      {
        headers: {
          Authorization: `Bearer ${tempToken}`,
        },
      }
    );

    setToken(response.data.token);

    if (onSuccess) {
      onSuccess(response.data);
    }

    return response.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const logout = (
  onSuccess?: () => void,
  onError?: (error: any) => void
): void => {
  try {
    // Clear token from storage
    localStorage.removeItem("token");

    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
  }
};
