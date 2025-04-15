/**
 * This is the mock base class for obsidian.  This allows running tests without needing obsidian itself running.
 *
 * The Obsidian API is pretty big so we only implment a sketch of the api and specific things we need.  This produces linter errors
 * but it is okay because they should run and test perfectly fine.
 *
 *
 * If you need to add new functionality, check the api docs here https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts
 */

export class Keymap {
  pushScope = jest.fn();
  popScope = jest.fn();
}

export class Scope {
  register = jest.fn();
  unregister = jest.fn();
}

export class Workspace {
  getActiveFile = jest.fn().mockReturnValue(null);
  getLayout = jest.fn();
  //... other workspace methods
}

export class Vault {
  _getAbstractFileByPath: TFile | null = new TFile();
  _read = "";
  _cachedRead = "";
  _files: TFile[] = [new TFile()];
  _markdownFiles: TFile[] = [];

  read = jest.fn().mockResolvedValue("");
  create = jest.fn().mockResolvedValue(null);
  getAbstractFileByPath = jest.fn().mockReturnValue(null);
  getMarkdownFiles = jest.fn().mockReturnValue([]);
  cachedRead = jest.fn().mockResolvedValue("");
  //... other vault methods
}

export class MetadataCache {
  getFileCache = jest.fn().mockReturnValue(null);
  getCache = jest.fn().mockReturnValue(null);
  // ... other metadataCache methods
  on = jest.fn();
  off = jest.fn();
  offref = jest.fn();
  trigger = jest.fn();
  tryTrigger = jest.fn();

  resolvedLinks: Record<string, Record<string, number>> = {};
  unresolvedLinks: Record<string, Record<string, number>> = {};
}

export class FileManager {
  getNewFileParent = jest.fn();
  renameFile = jest.fn();
  trashFile = jest.fn();
  generateMarkdownLink = jest.fn();
  processFrontMatter = jest.fn();
  setFrontMatter = jest.fn();
  // ... other fileManager methods
}

export class UserEvent {}

export class App {
  keymap = new Keymap();
  scope = new Scope();
  workspace = new Workspace();
  vault = new Vault();
  metadataCache = new MetadataCache();
  fileManager = new FileManager();
  lastEvent: UserEvent | null = null;

  loadLocalStorage = jest.fn().mockReturnValue(null);
  saveLocalStorage = jest.fn();
  //... other app methods
  commands = {
    executeCommandById: jest.fn(),
    findCommand: jest.fn(),
    listCommands: jest.fn(),
    on: jest.fn(),
    removeCommand: jest.fn(),
    register: jest.fn(),
    registerDom: jest.fn(),
  };
  plugins = {
    getPlugin: jest.fn(),
    enablePlugin: jest.fn(),
    disablePlugin: jest.fn(),
    plugins: {},
  };
  //settings = new PluginSettings();
  //view = new AppView();
  //internalPlugins = new InternalPlugins();
  //workspacePlugins = new WorkspacePlugins();
  //js_to_load = [];
  //css_to_load = [];
  //modals = [];
  //views = {};
  //abstractPopovers = [];
  //toast = new Toast();
}

export function addIcon(iconId: string, svgContent: string): void {}

export let apiVersion: string = "1.0.0";

export class TAbstractFile {
  path = "";
  name = "";
  parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
  basename = "";
  extension = "";
  size = 0;
  //... tfile properties
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
  //... tfolder properties
}

export class EditorPosition {
  line = 0;
  ch = 0;
}

export class Editor {
  getValue = jest.fn().mockReturnValue("");
  setValue = jest.fn();
  getCursor = jest.fn().mockReturnValue(new EditorPosition());
  getSelection = jest.fn().mockReturnValue("");
  replaceSelection = jest.fn();
  //...
}

export class MarkdownView {
  editor: any;
  //...
  getViewData = jest.fn().mockReturnValue("");
  setViewData = jest.fn();
  clear = jest.fn();
}

export class WorkspaceLeaf {
  view: any;
  containerEl: any;
  //...
  openFile = jest.fn();
  open = jest.fn();
  setViewState = jest.fn();
  getDisplayText = jest.fn().mockReturnValue("");
  on = jest.fn();
  off = jest.fn();
  detach = jest.fn();
  parent: any;
  getRoot = jest.fn();
  getContainer = jest.fn();
  getActiveViewOfType = jest.fn();
}

export class View {
  leaf: any;
  //...
  getViewType = jest.fn();
  getDisplayText = jest.fn().mockReturnValue("");
  on = jest.fn();
  off = jest.fn();
  registerView = jest.fn();
  load = jest.fn();
  unload = jest.fn();
  getState = jest.fn();
  setState = jest.fn();
}

export class MarkdownFileInfo {}

export class Component {
  load = jest.fn();
  unload = jest.fn();
  onLoad = jest.fn();
  onUnload = jest.fn();
  addChild = jest.fn();
  removeChild = jest.fn();
  register = jest.fn();
  registerEvent = jest.fn();
  registerDomEvent = jest.fn();
  registerInterval = jest.fn();
}

export class Modal {
  open = jest.fn();
  close = jest.fn();
  onOpen = jest.fn();
  onClose = jest.fn();
  setTitle = jest.fn();
  setContent = jest.fn();
  containerEl: any;
  modalEl: any;
  contentEl: any;
  titleEl: any;
  scope: any;
  app: any;
}

export function normalizePath(path: string): string {
  return path;
}

export class Notice {
  constructor(message: string | DocumentFragment, duration?: number) {}
  setMessage = jest.fn();
  hide = jest.fn();
}

export const moment = () => {};

export const Platform = {
  isDesktop: true,
  isMobile: false,
  isDesktopApp: true,
  isMobileApp: false,
  isIosApp: false,
  isAndroidApp: false,
  isPhone: false,
  isTablet: false,
  isMacOS: false,
  isWin: false,
  isLinux: false,
  isSafari: false,
  resourcePathPrefix: "",
};

export const prepareFuzzySearch = jest.fn();
