import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Floor, Paged, Project, Wing } from '../api/types';

/** Loads projects, then wings and floors for the selected project/wing. */
export function useStructure(initialProjectId?: number) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [wings, setWings] = useState<Wing[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [projectId, setProjectId] = useState<number | null>(initialProjectId ?? null);
  const [wingId, setWingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get<Paged<Project>>('/projects', { limit: 100 });
        setProjects(res.data);
        if (!initialProjectId && res.data.length === 1) setProjectId(res.data[0].id);
      } catch {
        /* handled by screens */
      }
    })();
  }, [initialProjectId]);

  useEffect(() => {
    setWings([]);
    setFloors([]);
    setWingId(null);
    if (!projectId) return;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<Paged<Wing>>('/wings', { projectId, limit: 100 });
        setWings(res.data);
      } finally {
        setLoading(false);
      }
    })();
  }, [projectId]);

  useEffect(() => {
    setFloors([]);
    if (!wingId) return;
    (async () => {
      try {
        const res = await api.get<Paged<Floor>>('/floors', { wingId, limit: 200 });
        setFloors(res.data);
      } catch {
        /* optional */
      }
    })();
  }, [wingId]);

  const selectProject = useCallback((id: string | number | null) => {
    setProjectId(id === null ? null : Number(id));
  }, []);

  const selectWing = useCallback((id: string | number | null) => {
    setWingId(id === null ? null : Number(id));
  }, []);

  return { projects, wings, floors, projectId, wingId, loading, selectProject, selectWing };
}
