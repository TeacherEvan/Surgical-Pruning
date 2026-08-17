import type { FileInventoryItem } from "./schemas.js";

export function generateTreeDiagram(
  files: FileInventoryItem[],
  _targetRoot: string,
): string {
  interface SimpleNode {
    children: Map<string, SimpleNode>;
    file?: FileInventoryItem;
  }

  const root: SimpleNode = { children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter((p): p is string => Boolean(p));
    let node: SimpleNode = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map<string, SimpleNode>() });
      }
      const nextNode = node.children.get(part);
      if (nextNode) {
        node = nextNode;
      }
      if (i === parts.length - 1) {
        node.file = file;
      }
    }
  }

  function renderNode(node: SimpleNode, prefix: string = ""): string {
    let output = "";
    for (const [name, value] of node.children) {
      const entries = Array.from(node.children.entries());
      const index = entries.findIndex(([k]) => k === name);
      const isLastEntry = index === entries.length - 1;
      const connector = isLastEntry ? "└── " : "├── ";
      const newPrefix = prefix + (isLastEntry ? "    " : "│   ");

      if (value.file) {
        const confidence = value.file.dead_code_signals.confidence;
        const badge =
          confidence >= 0.95 ? "🟢" : confidence >= 0.7 ? "🟡" : "🔴";
        output += `${prefix}${connector}${name} ${badge} ${(value.file.size_bytes / 1024).toFixed(1)}KB\n`;
      } else {
        output += `${prefix}${connector}${name}/\n`;
        output += renderNode(value, newPrefix);
      }
    }
    return output;
  }

  return renderNode(root);
}
