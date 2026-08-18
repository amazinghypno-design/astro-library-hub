// Hands off a file dropped on the Home page's upload button to the AdminLibrary
// page after navigation. Works because react-router navigates without a full
// page reload — a plain module-scoped variable is enough, no storage needed
// (File objects aren't serializable into localStorage/sessionStorage anyway).
let pendingFile: File | null = null;

export function setPendingUploadFile(file: File) {
  pendingFile = file;
}

export function takePendingUploadFile(): File | null {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
