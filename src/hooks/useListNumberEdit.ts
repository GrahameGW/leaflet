import { useState } from "react";
import { Block } from "components/Blocks/Block";
import { Replicache } from "replicache";
import type { ReplicacheMutators } from "src/replicache";

export function useListNumberEdit(
  blockValue: string,
  listData: Block["listData"],
  nextBlock: Block | null | undefined,
  rep: Replicache<ReplicacheMutators> | null,
  canWrite: boolean,
) {
  const [isEditingNumber, setIsEditingNumber] = useState(false);
  const [editValue, setEditValue] = useState("");

  const startEditing = (currentNumber: number) => {
    if (canWrite) {
      setEditValue(String(currentNumber));
      setIsEditingNumber(true);
    }
  };

  const handleChange = (value: string) => {
    setEditValue(value);
  };

  const handleBlur = async () => {
    const num = parseInt(editValue);
    if (!isNaN(num) && num > 0 && rep && listData) {
      await rep.mutate.assertFact({
        entity: blockValue,
        attribute: "block/list-number",
        data: { type: "number", value: num },
      });

      let currentBlock = nextBlock;
      let currentNumber = num + 1;

      while (currentBlock) {
        if (currentBlock.listData && currentBlock.listData.depth > listData.depth) {
          currentBlock = currentBlock.nextBlock;
          continue;
        }

        if (currentBlock.listData && currentBlock.listData.depth < listData.depth) {
          break;
        }

        if (!currentBlock.listData || currentBlock.listData.listStyle !== "ordered") {
          break;
        }

        if (currentBlock.listData.depth === listData.depth) {
          await rep.mutate.assertFact({
            entity: currentBlock.value,
            attribute: "block/list-number",
            data: { type: "number", value: currentNumber },
          });
          currentNumber++;
        }

        currentBlock = currentBlock.nextBlock;
      }
    }
    setIsEditingNumber(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setIsEditingNumber(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return {
    isEditingNumber,
    editValue,
    startEditing,
    handleChange,
    handleBlur,
    handleKeyDown,
  };
}
