import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User,
  Mail,
  Phone,
  Calendar,
  MapPin,
  Users,
  Save,
  Edit2,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import { useUser } from "../contexts/UserContext";
import { updateProfile, UserProfile } from "../api/users";

// Animated floating particles (from Landing page)
const FloatingParticles = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    {[...Array(12)].map((_, i) => (
      <motion.div
        key={i}
        initial={{
          opacity: 0,
          x: `${Math.random() * 100}%`,
          y: "100%",
        }}
        animate={{
          opacity: [0, 0.6, 0],
          y: "-10%",
        }}
        transition={{
          repeat: Infinity,
          duration: 8 + Math.random() * 8,
          delay: Math.random() * 8,
          ease: "linear",
        }}
        className="absolute"
        style={{
          left: `${Math.random() * 100}%`,
        }}
      >
        <div className="w-2 h-2 bg-yellow-400/60 rounded-full" />
      </motion.div>
    ))}
  </div>
);

// Animated background shapes
// const BackgroundShapes = () => (
//   <>
//     <motion.div
//       animate={{
//         y: [0, -30, 0],
//         x: [0, 20, 0],
//         scale: [1, 1.2, 1],
//       }}
//       transition={{ repeat: Infinity, duration: 10, ease: "easeInOut" }}
//       className="absolute top-20 right-[5%] w-96 h-96 bg-blue-200/20 rounded-full blur-3xl"
//     />
//     <motion.div
//       animate={{
//         y: [0, 40, 0],
//         x: [0, -30, 0],
//         scale: [1, 1.3, 1],
//       }}
//       transition={{
//         repeat: Infinity,
//         duration: 12,
//         ease: "easeInOut",
//         delay: 1,
//       }}
//       className="absolute bottom-20 left-[5%] w-[500px] h-[500px] bg-blue-200/20 rounded-full blur-3xl"
//     />
//     <motion.div
//       animate={{
//         scale: [1, 1.4, 1],
//         opacity: [0.15, 0.25, 0.15],
//       }}
//       transition={{
//         repeat: Infinity,
//         duration: 8,
//         ease: "easeInOut",
//         delay: 2,
//       }}
//       className="absolute top-1/3 right-1/3 w-[400px] h-[400px] bg-indigo-200/20 rounded-full blur-3xl"
//     />
//   </>
// );

// Cute user avatar with animation
const UserAvatar = ({
  firstName,
  lastName,
}: {
  firstName?: string;
  lastName?: string;
}) => {
  const initials =
    `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase() || "U";

  return (
    <motion.div
      initial={{ scale: 0, rotate: -180 }}
      animate={{ scale: 1, rotate: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 15 }}
      className="relative"
    >
      <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-gradient-to-br from-blue-400 via-blue-500 to-blue-500 flex items-center justify-center text-white text-2xl md:text-3xl font-bold shadow-xl shadow-blue-400/20">
        {initials}
      </div>
      <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
        className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full shadow-lg flex items-center justify-center"
      >
        <div className="w-2 h-2 bg-white rounded-full" />
      </motion.div>
    </motion.div>
  );
};

// Small cute info card
const InfoCard = ({
  icon: Icon,
  label,
  value,
  editable,
  onChange,
  type = "text",
}: {
  icon: React.ElementType;
  label: string;
  value: string | undefined;
  editable?: boolean;
  onChange?: (value: string) => void;
  type?: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");

  useEffect(() => {
    setEditValue(value || "");
  }, [value]);

  const handleSave = () => {
    if (onChange) {
      onChange(editValue);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(value || "");
    setIsEditing(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.01 }}
      className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 shadow-sm border border-white/50 dark:border-slate-700/30"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-400/10 to-blue-400/10 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 mb-0.5">{label}</p>
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                type={type}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSave}
                className="p-1.5 bg-green-400 text-white rounded-lg hover:bg-green-500 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="p-1.5 bg-red-400 text-white rounded-lg hover:bg-red-500 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
                {value || "—"}
              </p>
              {editable && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-1 text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors flex-shrink-0"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// Cute status badge
const StatusBadge = ({ status }: { status: string }) => {
  const statusColors: Record<string, string> = {
    ACTIVE:
      "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400",
    INACTIVE: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    SUSPENDED: "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
  };

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      className={`px-3 py-1 rounded-full text-xs font-medium ${
        statusColors[status] || statusColors.ACTIVE
      }`}
    >
      {status}
    </motion.span>
  );
};

// User type badge
const UserTypeBadge = ({ userType }: { userType?: string }) => {
  const colors: Record<string, string> = {
    STUDENT: "from-blue-400 to-blue-500",
    TEACHER: "from-green-400 to-green-500",
    ADMIN: "from-blue-400 to-blue-500",
    PARENT: "from-orange-400 to-orange-500",
    STAFF: "from-pink-400 to-pink-500",
  };
  const color = colors[userType || ""] || colors.STUDENT;

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: 0.1 }}
      className={`px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r ${color}`}
    >
      {userType || "User"}
    </motion.span>
  );
};

// Quick link item
const QuickLink = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <motion.div
    whileHover={{ scale: 1.01, x: 4 }}
    whileTap={{ scale: 0.99 }}
    onClick={onClick}
    className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl cursor-pointer group"
  >
    <span className="text-sm font-medium text-gray-700 dark:text-gray-200 group-hover:text-blue-500 transition-colors">
      {label}
    </span>
    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-blue-500 transition-colors" />
  </motion.div>
);

const Profile: React.FC = () => {
  const { user, refreshUser } = useUser();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  useEffect(() => {
    if (user?.profile) {
      setFormData({
        first_name: user.profile.first_name,
        last_name: user.profile.last_name,
        gender: user.profile.gender,
        date_of_birth: user.profile.date_of_birth,
        address: user.profile.address,
        external_id: user.profile.external_id,
      });
    }
  }, [user]);

  const handleChange = (field: keyof UserProfile, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      await updateProfile(formData, () => {
        setMessage({ type: "success", text: "Profile updated successfully!" });
        refreshUser();
        setTimeout(() => setMessage(null), 3000);
      });
    } catch (error: any) {
      setMessage({
        type: "error",
        text: error.response?.data?.message || "Failed to update profile",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-blue-50/50 dark:bg-black flex items-center justify-center">
        <FloatingParticles />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-12 h-12 border-3 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading...</p>
        </motion.div>
      </div>
    );
  }

  const { user: userData, profile } = user;

  return (
    <div className="min-h-screen bg-blue-50/50 dark:bg-black overflow-hidden relative">
      {/* Background Effects */}
      {/* <div className="fixed inset-0 pointer-events-none">
        <FloatingParticles />
        <BackgroundShapes />
      </div> */}

      <div className="relative z-10 pb-10 pt-4 px-4 md:px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center md:text-left mb-4"
          >
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-2xl md:text-2xl font-bold text-gray-800 dark:text-white mb-2"
            >
              My Profile
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm md:text-sm text-gray-500"
            >
              Manage your personal information
            </motion.p>
          </motion.div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card - Left Column */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="lg:col-span-1"
            >
              <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl rounded-3xl p-6 md:p-8 shadow-sm border border-white/50 dark:border-slate-700/30">
                {/* Avatar and Name */}
                <div className="flex flex-col items-center mb-6">
                  <UserAvatar
                    firstName={profile?.first_name}
                    lastName={profile?.last_name}
                  />
                  <motion.h2
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mt-4 text-lg md:text-xl font-bold text-gray-800 dark:text-white text-center"
                  >
                    {profile?.first_name || profile?.last_name
                      ? `${profile.first_name || ""} ${profile.last_name || ""}`
                      : userData.username}
                  </motion.h2>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="flex items-center gap-2 mt-3 text-sm"
                  >
                    <UserTypeBadge userType={profile?.user_type} />
                    <StatusBadge status={userData.status} />
                  </motion.div>
                </div>

                {/* Toast Message */}
                {message && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
                      message.type === "success"
                        ? "bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400"
                        : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400"
                    }`}
                  >
                    {message.text}
                  </motion.div>
                )}

                {/* Save Button */}
                <form onSubmit={handleSubmit}>
                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full py-3 bg-gradient-to-r from-blue-400 via-blue-500 to-blue-500 text-white font-semibold rounded-full shadow-lg shadow-blue-400/25 transition-all relative overflow-hidden disabled:opacity-60"
                  >
                    {isLoading ? (
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <Save className="w-5 h-5" />
                        Save Changes
                      </div>
                    )}
                  </motion.button>
                </form>
              </div>
            </motion.div>

            {/* Info Cards - Right Columns */}
            <div className="lg:col-span-2 space-y-6">
              {/* Personal Info Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Personal Information
                    </h3>
                  </div>
                  <InfoCard
                    icon={User}
                    label="First Name"
                    value={formData.first_name}
                    editable
                    onChange={(v) => handleChange("first_name", v)}
                  />
                  <InfoCard
                    icon={User}
                    label="Last Name"
                    value={formData.last_name}
                    editable
                    onChange={(v) => handleChange("last_name", v)}
                  />
                  <InfoCard
                    icon={Users}
                    label="Gender"
                    value={formData.gender}
                    editable
                    onChange={(v) => handleChange("gender", v)}
                  />
                  <InfoCard
                    icon={Calendar}
                    label="Date of Birth"
                    value={formData.date_of_birth}
                    type="date"
                    editable
                    onChange={(v) => handleChange("date_of_birth", v)}
                  />
                  <div className="md:col-span-2">
                    <InfoCard
                      icon={MapPin}
                      label="Address"
                      value={formData.address}
                      editable
                      onChange={(v) => handleChange("address", v)}
                    />
                  </div>
                </div>
              </motion.div>

              {/* Account Info Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Account Information
                    </h3>
                  </div>
                  <InfoCard
                    icon={User}
                    label="Username"
                    value={userData.username}
                  />
                  <InfoCard icon={Mail} label="Email" value={userData.email} />
                  <InfoCard
                    icon={Phone}
                    label="Phone Number"
                    value={userData.phone_number}
                  />
                  <InfoCard
                    icon={Calendar}
                    label="Member Since"
                    value={new Date(userData.created_at).toLocaleDateString()}
                  />
                </div>
              </motion.div>

              {/* Quick Links Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <QuickLink label="Change Password" onClick={() => {}} />
                  <QuickLink label="Notification Settings" onClick={() => {}} />
                  <QuickLink label="Privacy Settings" onClick={() => {}} />
                  <QuickLink label="Help & Support" onClick={() => {}} />
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
