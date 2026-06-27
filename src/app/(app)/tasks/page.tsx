import { getPrimaryBusiness, listTasks } from "@/lib/data";
import { PageHeader } from "@/components/PageHeader";
import { Empty } from "@/components/Section";
import { TasksManager } from "@/components/TasksManager";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const business = await getPrimaryBusiness();
  if (!business) {
    return (
      <>
        <PageHeader title="Tasks" />
        <Empty text="No business found. Mock seed missing." />
      </>
    );
  }

  const tasks = await listTasks(business.id, 200);

  return (
    <>
      <PageHeader title="Tasks" subtitle="Your to-do queue" />
      <TasksManager tasks={tasks} timezone={business.timezone} />
    </>
  );
}
