import { Replicache } from "replicache";
import { ReplicacheMutators } from "src/replicache";
import { useUIState } from "src/useUIState";
import { scanIndex } from "src/replicache/utils";
import { getBlocksWithType } from "src/replicache/getBlocks";
import { focusBlock } from "src/utils/focusBlock";
import { renumberOrderedList, AffectedBlock } from "src/utils/renumberOrderedList";

export async function deleteBlock(
  entities: string[],
  rep: Replicache<ReplicacheMutators>,
) {
  // get what pagess we need to close as a result of deleting this block
  let pagesToClose = [] as string[];
  // Track ordered list items being deleted for renumbering
  let orderedListAffected: AffectedBlock[] = [];
  let pageParent: string | undefined;

  for (let entity of entities) {
    let [type] = await rep.query((tx) =>
      scanIndex(tx).eav(entity, "block/type"),
    );
    if (type.data.value === "card") {
      let [childPages] = await rep?.query(
        (tx) => scanIndex(tx).eav(entity, "block/card") || [],
      );
      pagesToClose = [childPages?.data.value];
    }
    if (type.data.value === "mailbox") {
      let [archive] = await rep?.query(
        (tx) => scanIndex(tx).eav(entity, "mailbox/archive") || [],
      );
      let [draft] = await rep?.query(
        (tx) => scanIndex(tx).eav(entity, "mailbox/draft") || [],
      );
      pagesToClose = [archive?.data.value, draft?.data.value];
    }

    // Check if this is an ordered list item
    let [listStyle] = await rep.query((tx) =>
      scanIndex(tx).eav(entity, "block/list-style"),
    );
    if (listStyle?.data.value === "ordered") {
      let [isList] = await rep.query((tx) =>
        scanIndex(tx).eav(entity, "block/is-list"),
      );
      if (isList?.data.value) {
        // Get depth from parent structure - we'll use depth 1 as a marker
        // The renumber utility will handle all depths at the affected level
        orderedListAffected.push({
          entityId: entity,
          newDepth: 1, // Will trigger renumber of depth 1; utility handles grouping
        });
      }
    }
  }

  //  the next and previous blocks in the block list
  // if the focused thing is a page and not a block, return
  let focusedBlock = useUIState.getState().focusedEntity;
  let parent =
    focusedBlock?.entityType === "page"
      ? focusedBlock.entityID
      : focusedBlock?.parent;

  if (parent) {
    let parentType = await rep?.query((tx) =>
      scanIndex(tx).eav(parent, "page/type"),
    );
    if (parentType[0]?.data.value === "canvas") {
      useUIState
        .getState()
        .setFocusedBlock({ entityType: "page", entityID: parent });
      useUIState.getState().setSelectedBlocks([]);
    } else {
      let siblings =
        (await rep?.query((tx) => getBlocksWithType(tx, parent))) || [];

      let selectedBlocks = useUIState.getState().selectedBlocks;
      let firstSelected = selectedBlocks[0];
      let lastSelected = selectedBlocks[entities.length - 1];

      let prevBlock =
        siblings?.[
          siblings.findIndex((s) => s.value === firstSelected?.value) - 1
        ];
      let prevBlockType = await rep?.query((tx) =>
        scanIndex(tx).eav(prevBlock?.value, "block/type"),
      );

      let nextBlock =
        siblings?.[
          siblings.findIndex((s) => s.value === lastSelected.value) + 1
        ];
      let nextBlockType = await rep?.query((tx) =>
        scanIndex(tx).eav(nextBlock?.value, "block/type"),
      );

      if (prevBlock) {
        useUIState.getState().setSelectedBlock({
          value: prevBlock.value,
          parent: prevBlock.parent,
        });

        focusBlock(
          {
            value: prevBlock.value,
            type: prevBlockType?.[0].data.value,
            parent: prevBlock.parent,
          },
          { type: "end" },
        );
      } else {
        useUIState.getState().setSelectedBlock({
          value: nextBlock.value,
          parent: nextBlock.parent,
        });

        focusBlock(
          {
            value: nextBlock.value,
            type: nextBlockType?.[0]?.data.value,
            parent: nextBlock.parent,
          },
          { type: "start" },
        );
      }
    }
  }

  pagesToClose.forEach((page) => page && useUIState.getState().closePage(page));

  // Store pageParent before deletion for renumbering
  if (orderedListAffected.length > 0 && parent) {
    pageParent = parent;
  }

  await Promise.all(
    entities.map((entity) =>
      rep?.mutate.removeBlock({
        blockEntity: entity,
      }),
    ),
  );

  // Renumber remaining ordered list items after deletion
  if (orderedListAffected.length > 0 && pageParent) {
    await renumberOrderedList(rep, {
      pageParent,
      affectedBlocks: orderedListAffected,
    });
  }
}
