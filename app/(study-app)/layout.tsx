import { ActivityHeartbeat } from "@/components/study/ActivityHeartbeat";
import { SiteHeader } from "@/components/marketing/SiteHeader";

export default function StudyAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ActivityHeartbeat />
      <SiteHeader />
      {children}
    </>
  );
}
