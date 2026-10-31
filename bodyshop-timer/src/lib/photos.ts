import { SUPABASE_URL } from "@/lib/supabase/config";

export const PHOTO_BUCKET = "job-photos";
export const photoUrl = (path: string) => `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
