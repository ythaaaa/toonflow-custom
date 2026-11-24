export * from "@toonflow/drama-workspace";

export type DramaProjectChange = {
  directory: string;
  type: "created" | "renamed" | "deleted";
  projectId: string;
  projectName?: string;
};

const dramaProjectChangeEvent = "toonflow:drama-project-change";

export function notifyDramaProjectChange(change: DramaProjectChange) {
  window.dispatchEvent(new CustomEvent<DramaProjectChange>(dramaProjectChangeEvent, { detail: change }));
}

export function registerDramaProjectChanges(listener: (change: DramaProjectChange) => void) {
  const handle = (event: Event) => listener((event as CustomEvent<DramaProjectChange>).detail);
  window.addEventListener(dramaProjectChangeEvent, handle);
  return () => window.removeEventListener(dramaProjectChangeEvent, handle);
}
