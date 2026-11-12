import { createContext, useContext } from 'react';

// Opens the table editor of this pane's ERD from a table node (ERD-004). Only the stable function is shared,
// so opening it does not re-render every table node.
export const EditERDTableContext = createContext<((id: string) => void) | null>(null);
export const useEditERDTable = () => useContext(EditERDTableContext);
