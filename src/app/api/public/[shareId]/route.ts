import { NextResponse } from "next/server";
import { collection, doc, getDoc, getDocs, orderBy, query } from "firebase/firestore";
import { publicDb } from "@/lib/firebase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ shareId: string }> }) {
  const { shareId } = await context.params;
  if (!/^[0-9a-f-]{36}$/i.test(shareId)) return NextResponse.json({ error: "This share link is unavailable." }, { status: 404 });
  try {
    const shareSnapshot = await getDoc(doc(publicDb, "publicShares", shareId));
    if (!shareSnapshot.exists() || shareSnapshot.data().active !== true) {
      return NextResponse.json({ error: "This share link is unavailable." }, { status: 404 });
    }
    const share = shareSnapshot.data();
    const topicSnapshot = await getDoc(doc(publicDb, "topics", share.topicId));
    if (!topicSnapshot.exists()) return NextResponse.json({ error: "This topic is unavailable." }, { status: 404 });
    const tipsSnapshot = await getDocs(query(collection(publicDb, "topics", share.topicId, "tips"), orderBy("position")));
    const topic = topicSnapshot.data();
    return NextResponse.json({
      topic: {
        id: topicSnapshot.id,
        title: topic.title,
        description: topic.description ?? "",
        coverImagePath: topic.coverImagePath ?? null,
      },
      tips: tipsSnapshot.docs.map((tip) => {
        const value = tip.data();
        return { id: tip.id, title: value.title, summary: value.summary ?? "", blocks: value.blocks ?? [], position: value.position ?? 0 };
      }),
    }, { headers: { "cache-control": "no-store, private" } });
  } catch {
    return NextResponse.json({ error: "This share link is unavailable." }, { status: 404 });
  }
}
