import { createFileRoute } from "@tanstack/react-router";
import { EduFlowApp } from "@/components/eduflow/app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <EduFlowApp />;
}
