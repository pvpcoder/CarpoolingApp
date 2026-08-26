import { supabase } from "./supabase";

// Looks up a student by their school email and links them to a parent
// account via parent_student_links. Shared by the two independent places a
// parent's account can get created (email-confirmation deep link and the
// login self-heal fallback) plus the "link another child" flow in Profile —
// previously this exact logic was duplicated across the first two.
export async function linkParentToChildByEmail(
  parentId: string,
  childEmail: string
): Promise<{ success: boolean; studentName?: string; error?: string }> {
  const email = childEmail.trim().toLowerCase();
  if (!email) return { success: false, error: "Enter your child's school email." };

  const { data: student } = await supabase
    .from("students")
    .select("id, name")
    .eq("email", email)
    .maybeSingle();

  if (!student) {
    return {
      success: false,
      error: "No student found with that email. Their account isn't created until they've confirmed their email and logged into the app at least once - if they just signed up, ask them to log in first, then try linking again.",
    };
  }

  const { error } = await supabase
    .from("parent_student_links")
    .insert({ parent_id: parentId, student_id: student.id });

  if (error) {
    if (error.code === "23505") {
      return { success: false, error: "You're already linked to this child." };
    }
    return { success: false, error: error.message };
  }

  return { success: true, studentName: student.name };
}
