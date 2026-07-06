import { redirect } from "next/navigation"

/** Legacy URL — old marketing demo; send users to the real dashboard. */
export default function DemoRedirectPage() {
  redirect("/dashboard")
}
