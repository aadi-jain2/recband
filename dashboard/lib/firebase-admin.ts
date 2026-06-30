// Server-side only — never imported in client components
import { initializeApp, getApps, cert, App } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getDatabase } from "firebase-admin/database"

function getAdminApp(): App {
  if (getApps().length > 0) return getApps()[0]

  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL

  if (!privateKey || !clientEmail || privateKey === "demo") {
    return initializeApp({ projectId: "recoverpath-demo" }, "admin")
  }

  return initializeApp({
    credential: cert({ privateKey, clientEmail }),
    databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  }, "admin")
}

export const adminApp  = getAdminApp()
export const adminAuth = getAuth(adminApp)
export const adminDb   = getDatabase(adminApp)
