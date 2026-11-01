# rtk-trace-001: Sorted adapter and removeAll

**Answer (in order):**

1. `packages/toolkit/src/entities/sorted_state_adapter.ts#createSortedStateAdapter`
2. `packages/toolkit/src/entities/unsorted_state_adapter.ts#createUnsortedStateAdapter`
3. `packages/toolkit/src/entities/state_adapter.ts#createSingleArgumentStateOperator`

## How to get there

1. Open `createSortedStateAdapter`. Near the top it does `const { removeOne, removeMany, removeAll } = createUnsortedStateAdapter(selectId)`. The sorted adapter reuses the removal operations because removal does not depend on ordering.
2. In `createUnsortedStateAdapter`, the object returned at the end of the function builds each operation with a state-operator factory. `removeAll` is built with `createSingleArgumentStateOperator(removeAllMutably)`, while all the others use `createStateOperator`.
3. That is the call the prompt ends on.

## Why other sequences are wrong

- `createSortedStateAdapter` also calls `createStateOperator` directly (for `addOne`, `setAll` and others). That is a different function from the end function, and `createSortedStateAdapter` never calls `createSingleArgumentStateOperator` itself, so a shorter path does not exist.
- `createSingleArgumentStateOperator` itself calls `createStateOperator`, which comes after the end condition.
- `insert`, `findInsertIndex` and the other helpers in the sorted adapter handle ordering and are not on the path.
