import { Block } from "components/Blocks/Block";
import { Replicache } from "replicache";
import type { ReplicacheMutators } from "src/replicache";
import { getBlocksWithType } from "src/replicache/getBlocks";

export type AffectedBlock = {
  entityId: string;
  newDepth: number;
  previousDepth?: number;
  preserveStartingNumber?: number;
};

export type RenumberOptions = {
  pageParent: string;
  affectedBlocks: AffectedBlock[];
};

export type RenumberResult = {
  assignedNumbers: Map<string, number>;
};

export async function renumberOrderedList(
  rep: Replicache<ReplicacheMutators> | null | undefined,
  options: RenumberOptions,
): Promise<RenumberResult> {
  const result: RenumberResult = {
    assignedNumbers: new Map(),
  };

  if (!rep || options.affectedBlocks.length === 0) {
    return result;
  }

  const allBlocks = await rep.query((tx) =>
    getBlocksWithType(tx, options.pageParent),
  );

  if (!allBlocks) {
    return result;
  }

  const affectedDepths = new Set<number>();
  const preservedNumbers = new Map<string, number>();

  for (const affected of options.affectedBlocks) {
    affectedDepths.add(affected.newDepth);
    if (affected.previousDepth !== undefined) {
      affectedDepths.add(affected.previousDepth);
    }
    if (affected.preserveStartingNumber !== undefined) {
      preservedNumbers.set(affected.entityId, affected.preserveStartingNumber);
    }
  }

  for (const depth of affectedDepths) {
    const groups: Block[][] = [];

    if (depth === 1) {
      let currentGroup: Block[] = [];

      for (const block of allBlocks) {
        if (
          block.listData?.listStyle === "ordered" &&
          block.listData?.depth === 1
        ) {
          currentGroup.push(block);
        } else if (!block.listData) {
          if (currentGroup.length > 0) {
            groups.push(currentGroup);
            currentGroup = [];
          }
        }
      }
      if (currentGroup.length > 0) {
        groups.push(currentGroup);
      }
    } else {
      const groupsByParent = new Map<string, Block[]>();

      for (const block of allBlocks) {
        if (
          block.listData?.listStyle === "ordered" &&
          block.listData?.depth === depth
        ) {
          const parentPath = block.listData.path.find((p) => p.depth === depth - 1);
          const parentEntity = parentPath?.entity || options.pageParent;

          if (!groupsByParent.has(parentEntity)) {
            groupsByParent.set(parentEntity, []);
          }
          groupsByParent.get(parentEntity)!.push(block);
        }
      }

      for (const [, blocks] of groupsByParent) {
        groups.push(blocks);
      }
    }

    for (const blocks of groups) {
      if (blocks.length === 0) continue;

      let currentNumber = 1;

      if (preservedNumbers.has(blocks[0].value)) {
        currentNumber = preservedNumbers.get(blocks[0].value)!;
      }

      for (const block of blocks) {
        if (preservedNumbers.has(block.value)) {
          currentNumber = preservedNumbers.get(block.value)!;
        }

        if (block.listData?.listNumber !== currentNumber) {
          await rep.mutate.assertFact({
            entity: block.value,
            attribute: "block/list-number",
            data: { type: "number", value: currentNumber },
          });
        }

        result.assignedNumbers.set(block.value, currentNumber);
        currentNumber++;
      }
    }
  }

  return result;
}
