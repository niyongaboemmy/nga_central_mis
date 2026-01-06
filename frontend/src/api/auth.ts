import { AxiosResponse } from "axios";
import api from "../services/api";
import { setToken, removeToken } from "../utils/auth";

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

// Generic wrapper interface for backend responses
interface BackendResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export const login = async (
  data: LoginData,
  onSuccess?: (response: LoginResponse) => void,
  onError?: (error: any) => void
): Promise<LoginResponse | void> => {
  try {
    const response: AxiosResponse<BackendResponse<LoginResponse>> =
      await api.post("/auth/login", data);

    if (onSuccess) {
      onSuccess(response.data.data!);
    }

    return response.data.data;
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
    const response: AxiosResponse<BackendResponse<VerifyOTPResponse>> =
      await api.post(
        "/auth/verify-otp",
        { otp },
        {
          headers: {
            Authorization: `Bearer ${tempToken}`,
          },
        }
      );

    setToken(response.data.data!.token);

    if (onSuccess) {
      onSuccess(response.data.data!);
    }

    return response.data.data;
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
    removeToken();

    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
  }
};

// Password Recovery API
export interface ForgotPasswordResponse {
  tempToken: string;
  requiresOTP: boolean;
  message: string;
}

export const forgotPassword = async (
  email: string,
  onSuccess?: (response: ForgotPasswordResponse) => void,
  onError?: (error: any) => void
): Promise<ForgotPasswordResponse | void> => {
  try {
    const response: AxiosResponse<BackendResponse<ForgotPasswordResponse>> =
      await api.post("/auth/forgot-password", { email });

    console.log("Forgot password full response:", response);
    console.log("response.data:", response.data);
    console.log("response.data.data:", response.data.data);

    if (response.data.data?.tempToken) {
      setToken(response.data.data.tempToken);
    }

    if (onSuccess) {
      onSuccess(response.data.data!);
    }

    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface VerifyResetOTPResponse {
  resetToken: string;
  requiresNewPassword: boolean;
  message: string;
}

export const verifyResetOTP = async (
  otp: string,
  tempToken: string,
  onSuccess?: (response: VerifyResetOTPResponse) => void,
  onError?: (error: any) => void
): Promise<VerifyResetOTPResponse | void> => {
  try {
    const response: AxiosResponse<BackendResponse<VerifyResetOTPResponse>> =
      await api.post(
        "/auth/verify-reset-otp",
        { otp },
        {
          headers: {
            Authorization: `Bearer ${tempToken}`,
          },
        }
      );

    console.log("Verify reset OTP full response:", response);

    // Replace tempToken with resetToken
    if (response.data.data?.resetToken) {
      removeToken();
      setToken(response.data.data.resetToken);
    }

    if (onSuccess) {
      onSuccess(response.data.data!);
    }

    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export interface ResetPasswordResponse {
  message: string;
}

export const resetPassword = async (
  newPassword: string,
  onSuccess?: (response: ResetPasswordResponse) => void,
  onError?: (error: any) => void
): Promise<ResetPasswordResponse | void> => {
  try {
    const response: AxiosResponse<BackendResponse<ResetPasswordResponse>> =
      await api.post("/auth/reset-password", { newPassword });

    // Clear token after successful password reset
    removeToken();

    if (onSuccess) {
      onSuccess(response.data.data!);
    }

    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};
