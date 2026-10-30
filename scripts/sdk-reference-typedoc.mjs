import path from 'node:path';

const sourceRoot = process.env.SDK_SOURCE_ROOT;

if (!sourceRoot) {
	throw new Error('Set SDK_SOURCE_ROOT to the read-only @libra/sdk checkout before generating API docs.');
}

export default {
	entryPoints: [path.join(sourceRoot, 'src/index.ts')],
	entryPointStrategy: 'resolve',
	plugin: ['typedoc-plugin-markdown'],
	out: path.join(process.cwd(), 'generated/sdk-api'),
	readme: 'none',
	excludeInternal: true,
	excludePrivate: true,
	excludeProtected: true,
	categorizeByGroup: false,
	skipErrorChecking: true
};
