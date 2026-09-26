export const getWorkspaceRect = (): DOMRect | null =>
  (
    document.querySelector(
      '.map-workspace'
    ) as HTMLElement
  )?.getBoundingClientRect() || null;