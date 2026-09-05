import { redirect } from "next/navigation";

// The board is the app's home surface.
export default function BoardRedirect() {
  redirect("/");
}
