import { useEffect } from 'react';
import { useChartStore } from '@/features/chart/runtime/useChartStore';
import { projectRepo } from '@/features/projects/projectRepo';
import { useProjectStore } from '@/features/projects/useProjectStore';
import { useEditorStore } from './useEditorStore';

const DEBOUNCE_MS = 1000;

export function useAutosave() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = false;

    const flush = async () => {
      clearTimeout(timer);
      const { projectId, chart } = useChartStore.getState();
      if (!pending || !projectId || !chart) return;
      pending = false;
      useEditorStore.getState().set({ saveStatus: 'saving' });
      await projectRepo.saveChart(projectId, chart);
      await useProjectStore.getState().touch(projectId);
      if (!pending) useEditorStore.getState().set({ saveStatus: 'saved' });
    };

    const unsubscribe = useChartStore.subscribe((s, prev) => {
      if (s.projectId !== prev.projectId) {
        // Project switched: save the previous one right away.
        if (pending && prev.projectId && prev.chart)
          void projectRepo.saveChart(prev.projectId, prev.chart);
        pending = false;
        clearTimeout(timer);
        return;
      }
      if (s.chart === prev.chart || !prev.chart) return;
      pending = true;
      useEditorStore.getState().set({ saveStatus: 'unsaved' });
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), DEBOUNCE_MS);
    });

    const onHide = () => void flush();
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onHide);

    return () => {
      void flush();
      unsubscribe();
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);
}
