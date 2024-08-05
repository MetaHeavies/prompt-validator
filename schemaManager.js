import fs from 'fs/promises';
import path from 'path';

const SCHEMA_DIR = './schema';

export async function saveSchema(data) {
    const { promptModel, prompt, expectedStructure } = data;
    
    // Validate input
    if (!promptModel || !prompt || !expectedStructure || !Array.isArray(expectedStructure)) {
        throw new Error('Invalid schema data');
    }

    // Ensure schema directory exists
    await fs.mkdir(SCHEMA_DIR, { recursive: true });

    // Generate version number
    const version = await getNextVersion();

    // Filter out empty descriptions
    const filteredStructure = expectedStructure.map(item => {
        const filteredItem = { ...item };
        if (filteredItem.description === "") {
            delete filteredItem.description;
        }
        return filteredItem;
    });

    const schemaData = {
        version,
        promptModel,
        prompt,
        expectedStructure: filteredStructure
    };

    const fileName = `schema_v${version}.json`;
    const filePath = path.join(SCHEMA_DIR, fileName);

    await fs.writeFile(filePath, JSON.stringify(schemaData, null, 2));

    return { message: 'Schema saved successfully', version };
}

async function getNextVersion() {
    const files = await fs.readdir(SCHEMA_DIR);
    const versions = files
        .filter(file => file.startsWith('schema_v') && file.endsWith('.json'))
        .map(file => parseInt(file.split('_v')[1].split('.json')[0]));
    
    return Math.max(0, ...versions) + 1;
}

export async function loadSchema(version) {
    const fileName = `schema_v${version}.json`;
    const filePath = path.join(SCHEMA_DIR, fileName);

    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        throw new Error(`Failed to load schema version ${version}`);
    }
}

export async function listSchemas() {
    const files = await fs.readdir(SCHEMA_DIR);
    return files
        .filter(file => file.startsWith('schema_v') && file.endsWith('.json'))
        .map(file => ({
            version: parseInt(file.split('_v')[1].split('.json')[0]),
            fileName: file
        }))
        .sort((a, b) => b.version - a.version);
}