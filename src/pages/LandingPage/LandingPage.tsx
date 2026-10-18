import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton, PlayIcon, PlusIcon, SettingsIcon } from '@/components/ui';
import { useProjectStore } from '@/features/projects/useProjectStore';
import { ProjectList } from '@/features/projects/ProjectList/ProjectList';
import { NewProjectModal } from '@/features/projects/NewProjectModal/NewProjectModal';
import { ManageProjectsModal } from '@/features/projects/ManageProjectsModal/ManageProjectsModal';
import { SettingsModal } from '@/features/settings/SettingsModal/SettingsModal';
import { useSettingsStore } from '@/features/settings/useSettingsStore';
import { IMPORT_ACCEPT, importProjectFile } from '@/features/projects/importProjectFile';
import { pickFile } from '@/lib/file';
import { PhiraImportModal } from '@/features/projects/PhiraImportModal/PhiraImportModal';
import { ImportConfirmModal } from '@/features/projects/ImportConfirmModal/ImportConfirmModal';
import type { ImportResult, NewProjectInput } from '@/features/projects/types';
import styles from './LandingPage.module.css';

type ModalKind = 'new' | 'manage' | 'settings' | 'phira' | null;

export function LandingPage() {
  const navigate = useNavigate();
  const { projects, loaded, selectedId, select, create, add, remove } = useProjectStore();
  const updateSettings = useSettingsStore((s) => s.update);
  const [modal, setModal] = useState<ModalKind>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState<ImportResult | null>(null);
  const closeModal = () => setModal(null);

  const selectProject = (id: string) => {
    select(id);
    updateSettings({ lastProjectId: id });
  };

  const openProject = (id: string) => {
    selectProject(id);
    navigate(`/editor/${id}`);
  };

  const importLocal = async () => {
    setMenuOpen(false);
    setImportError(null);
    const file = await pickFile(IMPORT_ACCEPT);
    if (!file) return;
    const result = await importProjectFile(file);
    if (!result) return setImportError('Not a valid PhiCreate or PhiEdit chart.');
    setPending(result);
  };

  const importedFromPhira = (result: ImportResult) => {
    closeModal();
    setPending(result);
  };

  const confirmImport = async () => {
    if (!pending) return;
    const { project, format } = pending;
    setPending(null);
    await add(project);
    if (format !== 'phicreate') openProject(project.meta.id);
    else updateSettings({ lastProjectId: project.meta.id });
  };

  const deleteSelected = async () => {
    setConfirmDelete(false);
    if (selectedId) await remove(selectedId);
  };

  const createProject = async (input: NewProjectInput) => {
    const meta = await create(input);
    updateSettings({ lastProjectId: meta.id });
    closeModal();
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.logo}>
          Phi<span>Create</span>
        </h1>
        <IconButton label="Settings" onClick={() => setModal('settings')}>
          <SettingsIcon />
        </IconButton>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2 className={styles.panelTitle}>Projects</h2>
            <div className={styles.headerActions}>
              {importError && <span className={styles.error}>{importError}</span>}
              <div className={styles.menuWrap}>
                <Button size="sm" onClick={() => setMenuOpen((o) => !o)}>
                  Import…
                </Button>
                {menuOpen && (
                  <>
                    <div className={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                    <div className={styles.menu} role="menu">
                      <button className={styles.menuItem} role="menuitem" onClick={importLocal}>
                        From local file
                      </button>
                      <button
                        className={styles.menuItem}
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          setModal('phira');
                        }}
                      >
                        From Phira
                      </button>
                    </div>
                  </>
                )}
              </div>
              <Button size="sm" onClick={() => setModal('new')}>
                <PlusIcon /> New
              </Button>
            </div>
          </div>

          <div className={styles.scroll}>
            {loaded && projects.length === 0 ? (
              <div className={styles.empty}>
                <p>No projects yet.</p>
                <Button variant="primary" onClick={() => setModal('new')}>
                  Create your first project
                </Button>
              </div>
            ) : (
              <ProjectList
                projects={projects}
                selectedId={selectedId}
                onSelect={selectProject}
                onOpen={openProject}
              />
            )}
          </div>

          <footer className={styles.footer}>
            <Button
              variant="danger"
              disabled={!selectedId}
              onClick={() => (confirmDelete ? deleteSelected() : setConfirmDelete(true))}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? 'Confirm' : 'Delete'}
            </Button>
            <Button disabled={!selectedId} onClick={() => setModal('manage')}>
              Manage
            </Button>
            <Button
              variant="primary"
              size="lg"
              disabled={!selectedId}
              onClick={() => selectedId && openProject(selectedId)}
            >
              Begin Editing <PlayIcon />
            </Button>
          </footer>
        </div>
      </main>

      <NewProjectModal open={modal === 'new'} onClose={closeModal} onCreate={createProject} />
      <PhiraImportModal open={modal === 'phira'} onClose={closeModal} onImported={importedFromPhira} />
      <ImportConfirmModal
        result={pending}
        onConfirm={confirmImport}
        onCancel={() => setPending(null)}
      />
      <ManageProjectsModal open={modal === 'manage'} onClose={closeModal} />
      <SettingsModal open={modal === 'settings'} onClose={closeModal} />
    </div>
  );
}
