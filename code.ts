// This plugin creates pages in Figma based on user selection

// This file holds the main code for plugins. Code in this file has access to
// the *figma document* via the figma global object.
// You can access browser APIs in the <script> tag inside "ui.html" which has a
// full browser environment (See https://www.figma.com/plugin-docs/how-plugins-run).

// Show the HTML page in "ui.html"
figma.showUI(__html__, { width: 400, height: 800 });

// Handle messages from the UI
figma.ui.onmessage = (msg: {type: string, items?: any[], duplicateMode?: string}) => {
  if (msg.type === 'create-pages') {
    if (!msg.items || msg.items.length === 0) {
      figma.notify('Нет элементов для создания страниц');
      figma.closePlugin();
      return;
    }

    let createdPages = 0;
    const existingPages = figma.root.children.map(page => page.name);

    for (const item of msg.items) {
      // Check if page already exists
      if (existingPages.includes(item.name)) {
        if (msg.duplicateMode === 'skip') {
          console.log(`Страница "${item.name}" уже существует, пропускаем`);
          continue;
        }
      }

      // Create new page
      try {
        const newPage = figma.createPage();
        newPage.name = item.name;
        createdPages++;
        console.log(`Создана страница: ${item.name}`);
      } catch (error) {
        console.error(`Ошибка при создании страницы "${item.name}":`, error);
        figma.notify(`Ошибка при создании страницы "${item.name}"`);
      }
    }

    if (createdPages > 0) {
      figma.notify(`Создано страниц: ${createdPages}`);
    } else {
      figma.notify('Страницы не были созданы');
    }
  }

  // Close the plugin when done
  figma.closePlugin();
};
