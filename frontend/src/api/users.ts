import api from "../services/api";

// Backend response wrapper
interface BackendResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface User {
  user_id: number;
  username: string;
  email: string;
  phone_number?: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  profile_id: number;
  user_id: number;
  first_name?: string;
  last_name?: string;
  gender?: string;
  date_of_birth?: string;
  address?: string;
  user_type?: string;
  external_id?: string;
}

export interface UserWithProfile {
  user: User;
  profile: UserProfile | null;
}

export const getUsers = async (
  onSuccess?: (users: User[]) => void,
  onError?: (error: any) => void
): Promise<User[] | void> => {
  try {
    const response = await api.get<BackendResponse<User[]>>("/users");
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getCurrentUser = async (
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile>>(
      "/users/me"
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const getUser = async (
  id: number,
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<BackendResponse<UserWithProfile>>(
      `/users/${id}`
    );
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const createUser = async (
  userData: Partial<User>,
  onSuccess?: (user: User) => void,
  onError?: (error: any) => void
): Promise<User | void> => {
  try {
    const response = await api.post<BackendResponse<User>>("/users", userData);
    if (onSuccess && response.data.data) {
      onSuccess(response.data.data);
    }
    return response.data.data;
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const updateUser = async (
  id: number,
  userData: Partial<User>,
  onSuccess?: () => void,
  onError?: (error: any) => void
): Promise<void> => {
  try {
    await api.put(`/users/${id}`, userData);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};

export const deleteUser = async (
  id: number,
  onSuccess?: () => void,
  onError?: (error: any) => void
): Promise<void> => {
  try {
    await api.delete(`/users/${id}`);
    if (onSuccess) {
      onSuccess();
    }
  } catch (error) {
    if (onError) {
      onError(error);
    }
    throw error;
  }
};
