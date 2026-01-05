import api from "../services/api";

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
    const response = await api.get<User[]>("/users");
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

export const getUser = async (
  id: number,
  onSuccess?: (user: UserWithProfile) => void,
  onError?: (error: any) => void
): Promise<UserWithProfile | void> => {
  try {
    const response = await api.get<UserWithProfile>(`/users/${id}`);
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

export const createUser = async (
  userData: Partial<User>,
  onSuccess?: (user: User) => void,
  onError?: (error: any) => void
): Promise<User | void> => {
  try {
    const response = await api.post<User>("/users", userData);
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
