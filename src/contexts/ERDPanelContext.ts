import { createContext, useContext } from 'react';

/** The Properties or DBML column docked inside one ERD pane; each pane keeps its own (BUG-042). */
export type ERDPanel = 'closed' | 'properties' | 'dbml';

// Only the setter is shared, so opening a panel does not re-render the canvas or every table node.
export const OpenERDPanelContext = createContext<((panel: ERDPanel) => void) | null>(null);
export const useOpenERDPanel = () => useContext(OpenERDPanelContext);
