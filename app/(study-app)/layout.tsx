import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";

export default function StudyAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActivityHeartbeat />
      {children}
    </>
  );
}
