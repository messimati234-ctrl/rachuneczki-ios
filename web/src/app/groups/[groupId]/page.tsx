import { GroupWorkspace } from "@/components/group-workspace"

export default async function GroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return <GroupWorkspace groupId={decodeURIComponent(groupId)} />
}
