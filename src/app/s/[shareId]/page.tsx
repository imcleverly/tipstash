import { PublicTopicPage } from "@/components/public-topic";

export default async function SharedTopicRoute({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await params;
  return <PublicTopicPage shareId={shareId}/>;
}
