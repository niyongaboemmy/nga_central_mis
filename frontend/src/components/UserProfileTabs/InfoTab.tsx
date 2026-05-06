import React from "react";
import {
  Mail,
  Phone,
  Building,
  Calendar,
  MapPin,
  Shield,
  Clock,
  User as UserIcon,
  Activity,
  UserCircle,
  History,
} from "lucide-react";
import { UserWithProfile } from "../../api/users";
import { InfoItem } from "./TabShared";

interface InfoTabProps {
  user: UserWithProfile;
  isEditingInfo: boolean;
  editedInfo: any;
  setEditedInfo: (info: any) => void;
}

const InfoTab: React.FC<InfoTabProps> = ({
  user,
  isEditingInfo,
  editedInfo,
  setEditedInfo,
}) => {
  const calculateAge = (dobString: string | undefined) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const diff = Date.now() - dob.getTime();
    const ageDate = new Date(diff);
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const age = calculateAge(user.profile?.date_of_birth);

  if (isEditingInfo) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-900/40 p-6 rounded-[2rem] border border-gray-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              First Name
            </label>
            <input
              type="text"
              value={editedInfo.first_name || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  first_name: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              Last Name
            </label>
            <input
              type="text"
              value={editedInfo.last_name || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  last_name: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              Gender
            </label>
            <select
              value={editedInfo.gender || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  gender: e.target.value as any,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            >
              <option value="MALE">Male</option>
              <option value="FEMALE">Female</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              Date of Birth
            </label>
            <input
              type="date"
              value={editedInfo.date_of_birth || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  date_of_birth: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              Address
            </label>
            <input
              type="text"
              value={editedInfo.address || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  address: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              External ID
            </label>
            <input
              type="text"
              value={editedInfo.external_id || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  external_id: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 ml-1">
              Phone Number
            </label>
            <input
              type="text"
              value={editedInfo.phone_number || ""}
              onChange={(e) =>
                setEditedInfo({
                  ...editedInfo,
                  phone_number: e.target.value,
                })
              }
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-4">
      {/* Account Information Section */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
          <UserCircle className="w-3.5 h-3.5" />
          Account Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={UserIcon}
            label="Username"
            value={`@${user.user.username}`}
            highlight
          />
          <InfoItem
            icon={Mail}
            label="Email Address"
            value={user.user.email}
            highlight
          />
          <InfoItem
            icon={Shield}
            label="User Type"
            value={user.profile?.user_type || "USER"}
          />
          <InfoItem
            icon={Activity}
            label="Account Status"
            value={user.user.status}
          />
        </div>
      </section>

      {/* Personal Information Section */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
          <UserIcon className="w-3.5 h-3.5" />
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={UserIcon}
            label="First Name"
            value={user.profile?.first_name || "Not provided"}
          />
          <InfoItem
            icon={UserIcon}
            label="Last Name"
            value={user.profile?.last_name || "Not provided"}
          />
          <InfoItem
            icon={Building}
            label="Gender"
            value={user.profile?.gender || "Not specified"}
          />
          <InfoItem
            icon={Calendar}
            label="Date of Birth"
            value={
              user.profile?.date_of_birth
                ? `${new Date(user.profile.date_of_birth).toLocaleDateString()} ${age ? `(${age} years old)` : ""}`
                : "Not specified"
            }
          />
          <InfoItem
            icon={Phone}
            label="Phone Number"
            value={user.user.phone_number || "Not provided"}
          />
          <InfoItem
            icon={MapPin}
            label="Physical Address"
            value={user.profile?.address || "Not provided"}
          />
          {user.profile?.external_id && (
            <InfoItem
              icon={Shield}
              label="External ID"
              value={user.profile.external_id}
            />
          )}
        </div>
      </section>

      {/* System Information Section */}
      <section>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
          <History className="w-3.5 h-3.5" />
          System Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InfoItem
            icon={Clock}
            label="Member Since"
            value={new Date(user.user.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          />
          <InfoItem
            icon={Clock}
            label="Last Updated"
            value={new Date(user.user.updated_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          />
        </div>
      </section>
    </div>
  );
};

export default InfoTab;
