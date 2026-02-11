// This plugin creates pages in Figma based on user selection

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// Types for better type safety
interface PageItem {
  id: string;
  name: string;
  index: number;
  type: 'page' | 'separator';
}

interface PluginMessage {
  type: 'create-pages' | 'delete-page' | 'reorder-page' | 'rename-page' | 'refresh-pages';
  items?: PageItem[];
  pageId?: string;
  newIndex?: number;
  newName?: string;
}

interface NotificationMessage {
  type: 'notification';
  message: string;
  notificationType: 'info' | 'success' | 'warning' | 'error';
}

interface PagesUpdateMessage {
  type: 'existing-pages';
  pages: PageItem[];
}

// Notification Service
class NotificationService {
  static send(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    figma.ui.postMessage({
      type: 'notification',
      message,
      notificationType: type
    } as NotificationMessage);
  }
}

// Page Manager
class PageManager {
  static getExistingPages(): PageItem[] {
    return figma.root.children
      .filter(page => page && page.id && page.name)
      .map((page, index) => ({
        id: page.id,
        name: page.name,
        index,
        type: 'page' as const
      }));
  }

  static sendExistingPages(): void {
    try {
      const existingPages = this.getExistingPages();
      console.log('Sending existing pages to UI:', existingPages.length, 'pages');
      
      figma.ui.postMessage({
        type: 'existing-pages',
        pages: existingPages
      } as PagesUpdateMessage);
    } catch (error) {
      console.error('Error getting existing pages:', error);
      // Retry after delay
      setTimeout(() => {
        try {
          const existingPages = this.getExistingPages();
          figma.ui.postMessage({
            type: 'existing-pages',
            pages: existingPages
          } as PagesUpdateMessage);
        } catch (retryError) {
          console.error('Failed to get pages on retry:', retryError);
        }
      }, 200);
    }
  }

  static sendExistingPagesAfterDelete(deletedPageId: string): void {
    try {
      const existingPages = figma.root.children
        .filter(page => page && page.id && page.name && page.id !== deletedPageId)
        .map((page, index) => ({
          id: page.id,
          name: page.name,
          index,
          type: 'page' as const
        }));
      
      console.log('Sending existing pages to UI after deletion:', existingPages.length, 'pages');
      figma.ui.postMessage({
        type: 'existing-pages',
        pages: existingPages
      } as PagesUpdateMessage);
    } catch (error) {
      console.error('Error getting existing pages after deletion:', error);
      this.sendExistingPages();
    }
  }

  static createPages(items: PageItem[]): void {
    if (!items || items.length === 0) {
      NotificationService.send('No elements to create pages', 'warning');
      figma.closePlugin();
      return;
    }

    console.log('Received items for page creation:', items);
    let createdPages = 0;

    for (const item of items) {
      console.log('Processing item:', item);
      
      const isSeparator = item.type === 'separator' || item.name === '──────';

      try {
        const newPage = figma.createPage();
        newPage.name = isSeparator ? '---' : item.name;
        createdPages++;
        console.log(`Created page: ${newPage.name}`);
      } catch (error) {
        console.error(`Error creating page "${item.name}":`, error);
        NotificationService.send(`Error creating page "${item.name}"`, 'error');
      }
    }

    if (createdPages > 0) {
      NotificationService.send(`Created page: ${items[0].name}`, 'success');
      this.sendExistingPages();
    } else {
      NotificationService.send('No pages were created', 'warning');
    }
  }

  static deletePage(pageId: string): void {
    if (!pageId) {
      NotificationService.send('Page ID not specified for deletion', 'error');
      return;
    }

    try {
      console.log('Attempting to delete page with ID:', pageId);
      const pageToDelete = figma.root.children.find(page => page.id === pageId);
      
      if (!pageToDelete) {
        console.log('Page not found');
        NotificationService.send('Page not found', 'error');
        // Resync UI with actual pages
        this.sendExistingPages();
        return;
      }

      if (figma.root.children.length <= 1) {
        console.log('Cannot delete last remaining page');
        NotificationService.send(
          'You can’t delete the page you’re currently on when it is the only page in the file. Create or duplicate another page first.',
          'warning'
        );
        // Resync UI in case it optimistically hid the page
        this.sendExistingPages();
        return;
      }
      
      // If deleting the current page, switch to a neighbour first
      if (pageToDelete === figma.currentPage) {
        const pages = figma.root.children;
        const currentIndex = pages.indexOf(pageToDelete);
        let newCurrentPage: PageNode | null = null;

        if (currentIndex > 0) {
          newCurrentPage = pages[currentIndex - 1] as PageNode;
        } else if (currentIndex < pages.length - 1) {
          newCurrentPage = pages[currentIndex + 1] as PageNode;
        }

        if (!newCurrentPage) {
          console.log('No alternate page to switch to before deletion');
          NotificationService.send(
            'You can’t delete the page you’re currently on because it is the only page in the file.',
            'warning'
          );
          this.sendExistingPages();
          return;
        }

        figma.currentPage = newCurrentPage;
      }

      const pageName = pageToDelete.name;
      const pageIdToDelete = pageToDelete.id;
      pageToDelete.remove();
      
      console.log(`Page "${pageName}" deleted successfully`);
      NotificationService.send(`Page "${pageName}" deleted`, 'success');
    } catch (error) {
      console.error('Error deleting page:', error);
      NotificationService.send('Error deleting page', 'error');
      // On any error, resync UI with the real page list
      this.sendExistingPages();
    }
  }

  static reorderPage(pageId: string, newIndex: number): void {
    if (!pageId || newIndex === undefined) {
      NotificationService.send('Parameters not specified for page reordering', 'error');
      return;
    }

    try {
      const pageToMove = figma.root.children.find(page => page.id === pageId);
      if (!pageToMove) {
        NotificationService.send('Page not found', 'error');
        return;
      }

      const currentIndex = figma.root.children.indexOf(pageToMove);
      if (currentIndex !== -1 && currentIndex !== newIndex) {
        figma.root.insertChild(newIndex, pageToMove);
      }
    } catch (error) {
      console.error('Error moving page:', error);
      NotificationService.send('Error moving page', 'error');
    }
  }

  static renamePage(pageId: string, newName: string): void {
    if (!pageId || !newName) {
      NotificationService.send('Parameters not specified for page renaming', 'error');
      return;
    }

    try {
      const pageToRename = figma.root.children.find(page => page.id === pageId);
      if (!pageToRename) {
        NotificationService.send('Page not found', 'error');
        return;
      }

      const oldName = pageToRename.name;
      pageToRename.name = newName.trim();
      
      console.log(`Page renamed from "${oldName}" to "${newName}"`);
      NotificationService.send(`Page renamed to "${newName}"`, 'success');
    } catch (error) {
      console.error('Error renaming page:', error);
      NotificationService.send('Error renaming page', 'error');
    }
  }
}

// Message Handler
class MessageHandler {
  static handle(msg: PluginMessage): void {
    switch (msg.type) {
      case 'create-pages':
        if (msg.items) {
          PageManager.createPages(msg.items);
        }
        break;

      case 'delete-page':
        if (msg.pageId) {
          PageManager.deletePage(msg.pageId);
        }
        break;

      case 'reorder-page':
        if (msg.pageId && msg.newIndex !== undefined) {
          PageManager.reorderPage(msg.pageId, msg.newIndex);
        }
        break;

      case 'rename-page':
        if (msg.pageId && msg.newName) {
          PageManager.renamePage(msg.pageId, msg.newName);
        }
        break;

      case 'refresh-pages':
        PageManager.sendExistingPages();
        break;

      default:
        console.warn('Unknown message type:', (msg as {type: string}).type);
    }
  }
}

// Plugin initialization
figma.showUI(__html__, { width: 360, height: 800 });

// Send existing pages when UI loads
PageManager.sendExistingPages();

// Handle messages from the UI
figma.ui.onmessage = (msg: PluginMessage) => {
  MessageHandler.handle(msg);
};
