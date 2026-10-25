import React, { useEffect, useState } from "react";
import Modal from "../ui/Modal";
import { AppsInstaller } from "./AppsInstallerPage";
import { OPEN_APPS_EVENT } from "./openAppsDialog";

/** The installer as a dialog over whatever page the user is on (see openAppsDialog.ts). */
export const AppsDialog: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onOpen = (e: Event) => {
      e.preventDefault(); // tells requestAppsDialog() the request was taken
      setOpen(true);
    };
    window.addEventListener(OPEN_APPS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_APPS_EVENT, onOpen);
  }, []);

  return (
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Get the apps" size="2xl" contentClassName="p-4 sm:p-6">
      {open && <AppsInstaller />}
    </Modal>
  );
};

export default AppsDialog;
