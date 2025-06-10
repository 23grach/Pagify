// This plugin creates pages in Figma based on user selection

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// Show the HTML page in "ui.html"
figma.showUI(__html__, { width: 600, height: 800 });

// Send existing pages to UI on startup
function sendExistingPages() {
  try {
    const existingPages = figma.root.children
      .filter(page => page && page.id && page.name) // Filter out invalid pages
      .map((page, index) => ({
        id: page.id,
        name: page.name,
        index: index,
        type: 'page'
      }));
    
    console.log('Sending existing pages to UI:', existingPages.length, 'pages');
    figma.ui.postMessage({
      type: 'existing-pages',
      pages: existingPages
    });
  } catch (error) {
    console.error('Error getting existing pages:', error);
    // Try again after a short delay
    setTimeout(() => {
      try {
        const existingPages = figma.root.children
          .filter(page => page && page.id && page.name)
          .map((page, index) => ({
            id: page.id,
            name: page.name,
            index: index,
            type: 'page'
          }));
        
        figma.ui.postMessage({
          type: 'existing-pages',
          pages: existingPages
        });
      } catch (retryError) {
        console.error('Failed to get pages on retry:', retryError);
      }
    }, 200);
  }
}

// Send existing pages to UI after deletion, excluding the deleted page
function sendExistingPagesAfterDelete(deletedPageId: string) {
  try {
    const existingPages = figma.root.children
      .filter(page => page && page.id && page.name && page.id !== deletedPageId) // Filter out invalid pages and deleted page
      .map((page, index) => ({
        id: page.id,
        name: page.name,
        index: index,
        type: 'page'
      }));
    
    console.log('Sending existing pages to UI after deletion:', existingPages.length, 'pages');
    figma.ui.postMessage({
      type: 'existing-pages',
      pages: existingPages
    });
  } catch (error) {
    console.error('Error getting existing pages after deletion:', error);
    // Fallback to regular sendExistingPages
    sendExistingPages();
  }
}

// Send existing pages when UI loads
sendExistingPages();

// Handle messages from the UI
figma.ui.onmessage = (msg: {type: string, items?: any[], duplicateMode?: string, pageId?: string, newIndex?: number, newName?: string}) => {
  if (msg.type === 'create-pages') {
    if (!msg.items || msg.items.length === 0) {
      figma.notify('No elements to create pages');
      figma.closePlugin();
      return;
    }

    console.log('Received items for page creation:', msg.items);
    let createdPages = 0;
    const existingPages = figma.root.children.map(page => page.name);

    for (const item of msg.items) {
      console.log('Processing item:', item);
      
      // For separators, always create pages (allow duplicates)
      const isSeparator = item.type === 'separator' || item.name === '──────';
      
      if (!isSeparator) {
        // Check if page already exists (only for non-separator pages)
        const pageName = item.name;
        if (existingPages.includes(pageName)) {
          if (msg.duplicateMode === 'skip') {
            console.log(`Page "${pageName}" already exists, skipping`);
            continue;
          }
        }
      }

      // Create new page
      try {
        const newPage = figma.createPage();
        // If it's a separator, use "---" as page name, otherwise use original name
        newPage.name = isSeparator ? '---' : item.name;
        createdPages++;
        console.log(`Created page: ${newPage.name}`);
      } catch (error) {
        console.error(`Error creating page "${item.name}":`, error);
        figma.notify(`Error creating page "${item.name}"`);
      }
    }

    if (createdPages > 0) {
      figma.notify(`Created pages: ${createdPages}`);
      // Send updated pages list to UI
      sendExistingPages();
    } else {
      figma.notify('No pages were created');
    }
    return; // Don't close plugin automatically
  }

  if (msg.type === 'delete-page') {
    if (!msg.pageId) {
      figma.notify('Page ID not specified for deletion');
      return;
    }

    try {
      console.log('Attempting to delete page with ID:', msg.pageId);
      const pageToDelete = figma.root.children.find(page => page.id === msg.pageId);
      if (!pageToDelete) {
        console.log('Page not found');
        figma.notify('Page not found');
        return;
      }

      // Don't allow deleting the last page
      if (figma.root.children.length <= 1) {
        console.log('Cannot delete last page');
        figma.notify('Cannot delete the last page');
        return;
      }

      const pageName = pageToDelete.name;
      const pageId = pageToDelete.id;
      pageToDelete.remove();
      console.log(`Page "${pageName}" deleted successfully`);
      figma.notify(`Page "${pageName}" deleted`);
      
      // Immediately send updated pages list to UI
      console.log('Sending updated pages list to UI');
      sendExistingPagesAfterDelete(pageId);
    } catch (error) {
      console.error('Error deleting page:', error);
      figma.notify('Error deleting page');
    }
  }

  if (msg.type === 'reorder-page') {
    if (!msg.pageId || msg.newIndex === undefined) {
      figma.notify('Parameters not specified for page reordering');
      return;
    }

    try {
      const pageToMove = figma.root.children.find(page => page.id === msg.pageId);
      if (!pageToMove) {
        figma.notify('Page not found');
        return;
      }

      // In Figma API, we need to use insertChild method to reorder pages
      const currentIndex = figma.root.children.indexOf(pageToMove);
      if (currentIndex !== -1 && currentIndex !== msg.newIndex) {
        figma.root.insertChild(msg.newIndex, pageToMove);
        figma.notify('Page moved');
        
        // Send updated pages list to UI
        sendExistingPages();
      }
    } catch (error) {
      console.error('Error moving page:', error);
      figma.notify('Error moving page');
    }
  }

  if (msg.type === 'rename-page') {
    if (!msg.pageId || !msg.newName) {
      figma.notify('Parameters not specified for page renaming');
      return;
    }

    try {
      const pageToRename = figma.root.children.find(page => page.id === msg.pageId);
      if (!pageToRename) {
        figma.notify('Page not found');
        return;
      }

      pageToRename.name = msg.newName;
      figma.notify(`Page renamed to "${msg.newName}"`);
      
      // Send updated pages list to UI
      sendExistingPages();
    } catch (error) {
      console.error('Error renaming page:', error);
      figma.notify('Error renaming page');
    }
  }

  if (msg.type === 'close-plugin') {
    figma.closePlugin();
  }
};
