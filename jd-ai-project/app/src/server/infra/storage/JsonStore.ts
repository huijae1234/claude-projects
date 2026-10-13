import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type AppError, ErrorCode, type Result, err, ok } from '../../../shared/result';

const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** data/<컬렉션>/<id>.json 에 엔티티 하나씩 저장한다. 폴더 복사만으로 이식 가능. */
export class JsonStore {
  constructor(private readonly root: string) {}

  private file(collection: string, id: string): Result<string, AppError> {
    if (!SAFE_ID.test(collection) || !SAFE_ID.test(id)) {
      return err(ErrorCode.InvalidId, `허용되지 않는 컬렉션/ID: ${collection}/${id}`);
    }
    return ok(path.join(this.root, collection, `${id}.json`));
  }

  async put<T>(collection: string, id: string, value: T): Promise<Result<void, AppError>> {
    const f = this.file(collection, id);
    if (!f.ok) return f;
    try {
      await mkdir(path.dirname(f.value), { recursive: true });
      await writeFile(f.value, JSON.stringify(value, null, 2), 'utf8');
      return ok(undefined);
    } catch (e) {
      return err(ErrorCode.Storage, String(e));
    }
  }

  async get<T>(collection: string, id: string): Promise<Result<T, AppError>> {
    const f = this.file(collection, id);
    if (!f.ok) return f;
    try {
      return ok(JSON.parse(await readFile(f.value, 'utf8')) as T);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(ErrorCode.NotFound, `${collection}/${id} 없음`);
      }
      return err(ErrorCode.Storage, String(e));
    }
  }

  async list<T>(collection: string): Promise<Result<T[], AppError>> {
    if (!SAFE_ID.test(collection)) return err(ErrorCode.InvalidId, `허용되지 않는 컬렉션: ${collection}`);
    const dir = path.join(this.root, collection);
    try {
      const names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort();
      const items = await Promise.all(names.map(async (n) => JSON.parse(await readFile(path.join(dir, n), 'utf8')) as T));
      return ok(items);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return ok([]);
      return err(ErrorCode.Storage, String(e));
    }
  }

  async remove(collection: string, id: string): Promise<Result<void, AppError>> {
    const f = this.file(collection, id);
    if (!f.ok) return f;
    try {
      await rm(f.value, { force: true });
      return ok(undefined);
    } catch (e) {
      return err(ErrorCode.Storage, String(e));
    }
  }
}
