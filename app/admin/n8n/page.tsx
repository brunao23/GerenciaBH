import { redirect } from "next/navigation"

export default function LegacyN8NPage() {
    redirect("/admin/workflows")
}
