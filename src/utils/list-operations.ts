import { Block } from "components/Blocks/Block";
import { Replicache } from "replicache";
import type { ReplicacheMutators } from "src/replicache";
import { useUIState } from "src/useUIState";
import { getBlocksWithType } from "src/hooks/queries/useBlocks";
import { v7 } from "uuid";

export async function orderListItems(
  block: Block,
  rep?: Replicache<ReplicacheMutators> | null,
) {
  if (!block.listData) return;
  await rep?.mutate.assertFact({
    entity: block.value,
    attribute: "block/list-style",
    data: { type: "list-style-union", value: "ordered" },
  });
  await setListNumberForNewBlock(block.value, block.parent, rep);
}

export function unorderListItems(
  block: Block,
  rep?: Replicache<ReplicacheMutators> | null,
) {
  if (!block.listData) return;
  rep?.mutate.assertFact({
    entity: block.value,
    attribute: "block/list-style",
    data: { type: "list-style-union", value: "unordered" },
  });
}
export function indent(
  block: Block,
  previousBlock?: Block,
  rep?: Replicache<ReplicacheMutators> | null,
) {
  if (!block.listData) return false;
  if (!previousBlock?.listData) return false;
  let depth = block.listData.depth;
  let newParent = previousBlock.listData.path.find((f) => f.depth === depth);
  if (!newParent) return false;
  if (useUIState.getState().foldedBlocks.includes(newParent.entity))
    useUIState.getState().toggleFold(newParent.entity);
  rep?.mutate.retractFact({ factID: block.factID });
  rep?.mutate.addLastBlock({
    parent: newParent.entity,
    factID: v7(),
    entity: block.value,
  });
  rep?.mutate.assertFact({
    entity: block.value,
    attribute: "block/list-number",
    data: { type: "number", value: 1 },
  });
  return true;
}

export function outdentFull(
  block: Block,
  rep?: Replicache<ReplicacheMutators> | null,
) {
  if (!block.listData) return;

  // make this block not a list
  rep?.mutate.assertFact({
    entity: block.value,
    attribute: "block/is-list",
    data: { type: "boolean", value: false },
  });

  // find the next block that is a level 1 list item or not a list item.
  // If there are none or this block is a level 1 list item, we don't need to move anything
  let after = block.listData?.path.find((f) => f.depth === 1)?.entity;

  // move this block to be after that block
  after &&
    after !== block.value &&
    rep?.mutate.moveBlock({
      block: block.value,
      oldParent: block.listData.parent,
      newParent: block.parent,
      position: { type: "after", entity: after },
    });

  // move all the childen to the be under it as a level 1 list item
  rep?.mutate.moveChildren({
    oldParent: block.value,
    newParent: block.parent,
    after: block.value,
  });
}

export async function outdent(
  block: Block,
  previousBlock: Block | null,
  rep?: Replicache<ReplicacheMutators> | null,
) {
  if (!block.listData) return false;
  let listData = block.listData;
  if (listData.depth === 1) {
    rep?.mutate.assertFact({
      entity: block.value,
      attribute: "block/is-list",
      data: { type: "boolean", value: false },
    });
    rep?.mutate.moveChildren({
      oldParent: block.value,
      newParent: block.parent,
      after: block.value,
    });
  } else {
    if (!previousBlock || !previousBlock.listData) return false;
    let after = previousBlock.listData.path.find(
      (f) => f.depth === listData.depth - 1,
    )?.entity;
    if (!after) return false;
    let parent: string | undefined = undefined;
    if (listData.depth === 2) {
      parent = block.parent;
    } else {
      parent = previousBlock.listData.path.find(
        (f) => f.depth === listData.depth - 2,
      )?.entity;
    }
    if (!parent) return false;
    if (useUIState.getState().foldedBlocks.includes(parent))
      useUIState.getState().toggleFold(parent);
    await rep?.mutate.outdentBlock({
      block: block.value,
      newParent: parent,
      oldParent: listData.parent,
      after,
    });

    if (!rep) return;
    const allBlocks = await rep.query(async (tx) => {
      return await getBlocksWithType(tx, parent);
    });
    if (!allBlocks) return;

    const currentIndex = allBlocks.findIndex(b => b.value === block.value);
    if (currentIndex === -1) return;

    const newDepth = listData.depth - 1;

    let displayNumber = 1;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const prevBlock = allBlocks[i];
      if (!prevBlock.listData) {
        break;
      }
      if (prevBlock.listData.depth > newDepth) {
        continue;
      }
      if (prevBlock.listData.depth < newDepth) {
        break;
      }
      displayNumber = (prevBlock.listData.listNumber || 0) + 1;
      break;
    }

    await rep.mutate.assertFact({
      entity: block.value,
      attribute: "block/list-number",
      data: { type: "number", value: displayNumber },
    });
  }
}
  
  export async function setListNumberForNewBlock(
    blockEntityID: string,
    parentEntityID: string,
    rep?: Replicache<ReplicacheMutators> | null,
  ) {
    if (!rep) return;
    const allBlocks = await rep.query(async (tx) => {
      return await getBlocksWithType(tx, parentEntityID);
    });

    if (!allBlocks) return;
    const currentIndex = allBlocks.findIndex(b => b.value === blockEntityID);
    if (currentIndex === -1) return;

    const currentBlock = allBlocks[currentIndex];
    if (!currentBlock.listData?.listStyle || currentBlock.listData.listStyle !== "ordered") {
      return;
    }

    let displayNumber = 1;
    const depth = currentBlock.listData.depth;
    for (let i = currentIndex - 1; i >= 0; i--) {
      const block = allBlocks[i];
      if (!block.listData || block.listData.listStyle ===
  "unordered") {
        break;
      }
      if (block.listData.depth > depth) {
        continue;
      }
      else if (block.listData.depth < depth) {
        break;
      }
      displayNumber = (block.listData.listNumber || 0) + 1;
      break;
    }

    await rep.mutate.assertFact({
      entity: blockEntityID,
      attribute: "block/list-number",
      data: { type: "number", value: displayNumber },
    });
  }
