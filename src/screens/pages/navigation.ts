/**
 * Where a tap on an item goes. A folder opens as a folder; a page or a file
 * opens in the viewer (`app/pages/view.tsx`). `trail` is the names above,
 * so the next header can say where it is without a request.
 */
import { router } from "expo-router";
import type { PageNode } from "@/api/pages";

export function openNode(node: PageNode, { trail }: { trail: string }): void {
  if (node.kind === "folder") {
    router.push({
      pathname: "/pages/folder",
      params: { spaceId: String(node.spaceId), parentId: String(node.id), title: node.title, trail },
    });
    return;
  }
  router.push({
    pathname: "/pages/view",
    params: { spaceId: String(node.spaceId), nodeId: String(node.id), title: node.title },
  });
}
