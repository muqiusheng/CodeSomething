import {PageSkeleton} from '../../components/shared/LoadingState';
import {useEffect, useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {errorMessage, schoolRequest, type SchemaColumn, type SchoolSchema} from './school-api';

export function WorkbenchNavigator({courseId, revision, database, onDatabaseChange, busy}: {
  courseId: string; revision: number; database: string; onDatabaseChange: (name: string) => void; busy: boolean;
}) {
  const courseUrl = '/api/school/courses/' + encodeURIComponent(courseId);
  const [schema, setSchema] = useState<SchoolSchema>();
  const [databases, setDatabases] = useState<string[]>([]);
  const [databaseName, setDatabaseName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<{kind: 'table' | 'view'; name: string; column?: string}>();
  useEffect(() => {
    const controller = new AbortController();
    setListLoading(true); setListError('');
    schoolRequest<string[]>(courseUrl + '/databases', undefined, controller.signal)
      .then(names => {if (!controller.signal.aborted) setDatabases(names);})
      .catch(error => {if (!controller.signal.aborted) setListError(errorMessage(error));})
      .finally(() => {if (!controller.signal.aborted) setListLoading(false);});
    return () => controller.abort();
  }, [courseUrl, revision, refresh]);

  useEffect(() => {
    setError('');
    if (!database) {setSchema(undefined); setLoading(false); return;}
    const controller = new AbortController();
    setSchema(undefined);
    setLoading(true);
    schoolRequest<SchoolSchema>(courseUrl + '/schema?database=' + encodeURIComponent(database), undefined, controller.signal)
      .then(value => {if (!controller.signal.aborted) setSchema(value);})
      .catch(error => {if (!controller.signal.aborted) setError(errorMessage(error));})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [courseUrl, database, revision, refresh]);

  async function createDatabase() {
    setCreating(true); setCreateError('');
    try {
      const {name} = await schoolRequest<{name: string}>(courseUrl + '/databases', {name: databaseName.trim()});
      setDatabaseName('');
      setSelected(undefined);
      onDatabaseChange(name);
      setRefresh(value => value + 1);
    } catch (error) {setCreateError(errorMessage(error));}
    finally {setCreating(false);}
  }

  const query = filter.trim().toLowerCase();
  const matches = (...names: string[]) => names.some(name => name.toLowerCase().includes(query));
  const tables = schema?.tables.filter(table => matches(table.name, ...table.columns.map(c => c.name),
    ...table.foreignKeys.flatMap(key => [key.name, ...key.columns.map(c => c.referencedTable)]),
    ...table.triggers.map(trigger => trigger.name))) ?? [];
  const views = schema?.views.filter(view => matches(view.name, ...view.columns.map(c => c.name))) ?? [];
  const procedures = schema?.procedures.filter(name => matches(name)) ?? [];
  const object = selected?.kind === 'view' ? schema?.views.find(view => view.name === selected.name)
    : schema?.tables.find(table => table.name === selected?.name);
  const property = object?.columns.find(column => column.name === selected?.column);

  function columnList(kind: 'table' | 'view', name: string, columns: SchemaColumn[]) {
    const visible = matches(name) ? columns : columns.filter(column => matches(column.name));
    return visible.length > 0 && <ul>{visible.map(column => <li key={column.name}>
      <button type="button" className="school-schema-field" aria-pressed={selected?.kind === kind && selected.name === name && selected.column === column.name}
        onClick={() => setSelected({kind, name, column: column.name})}>
        {column.name}{column.primaryKey && <span>PK</span>}
      </button>
    </li>)}</ul>;
  }

  return <div className="school-schema-browser">
    <label className="school-database-select">数据库
      <select className="select" value={database} disabled={busy || creating} onChange={event => {
        setSelected(undefined);
        onDatabaseChange(event.target.value);
      }}>
        <option value="">不选数据库</option>
        {database && !databases.includes(database) && <option value={database}>{database}</option>}
        {databases.map(name => <option key={name} value={name} disabled={name === 'performance_schema'}>
          {name === 'performance_schema' ? name + '（未启用）' : name}
        </option>)}
      </select>
    </label>
    <details className="school-create-database">
      <summary>新建数据库</summary>
      <form onSubmit={event => {event.preventDefault(); void createDatabase();}}>
        <label>库名<input className="input" value={databaseName} maxLength={64} required
          onChange={event => setDatabaseName(event.target.value)} placeholder="例如 student_info"/></label>
        <button type="submit" className="btn button secondary" disabled={busy || creating || !databaseName.trim()}>
          {creating ? '正在创建…' : '创建并选中'}
        </button>
      </form>
      {createError && <p role="alert">{createError}</p>}
    </details>
    {listError && <p className="school-error-panel" role="alert">{listError}</p>}
    <div className="school-workbench-controls">
      <input className="input" type="search" aria-label="Filter objects" placeholder="Filter objects" value={filter} onChange={event => setFilter(event.target.value)}/>
      <button type="button" className="btn button secondary" aria-label="刷新对象" title="刷新对象" disabled={loading || listLoading || creating} onClick={() => setRefresh(value => value + 1)}>
        <RefreshCw size={15} aria-hidden="true"/>
      </button>
    </div>
    {(loading || listLoading) && <PageSkeleton variant="inline" label="正在读取数据库对象…"/>}
    {error && <p className="school-error-panel" role="alert">{error}</p>}
    {schema && <div className="school-schema-tree">
      <strong className="school-schema-name">{schema.database}</strong>
      {tables.length > 0 && <details open>
        <summary>Tables ({tables.length})</summary>
        {tables.map(table => <details key={table.name} open={query ? true : undefined}>
          <summary onClick={() => setSelected({kind: 'table', name: table.name})}>{table.name}</summary>
          <details open={query ? true : undefined}><summary>Columns</summary>
            {columnList('table', table.name, table.columns)}
          </details>
          <details open={query ? true : undefined}><summary>Foreign Keys ({table.foreignKeys.length})</summary>
            {table.foreignKeys.map(key => <details key={key.name} open={query ? true : undefined}>
              <summary>{key.name}</summary>
              <ul>{key.columns.map(column => <li key={column.column}>
                {column.column} → {column.referencedSchema === schema.database ? '' : column.referencedSchema + '.'}{column.referencedTable}.{column.referencedColumn}
              </li>)}</ul>
              <p>ON UPDATE {key.onUpdate}<br/>ON DELETE {key.onDelete}</p>
            </details>)}
          </details>
          <details open={query ? true : undefined}><summary>Triggers ({table.triggers.length})</summary>
            <ul>{table.triggers.map(trigger => <li key={trigger.name}>{trigger.name} · {trigger.timing} {trigger.event}</li>)}</ul>
          </details>
        </details>)}
      </details>}
      <details open={query ? true : undefined}><summary>Views ({views.length})</summary>
        {views.map(view => <details key={view.name} open={query ? true : undefined}>
          <summary onClick={() => setSelected({kind: 'view', name: view.name})}>{view.name}</summary>
          {columnList('view', view.name, view.columns)}
        </details>)}
      </details>
      <details open={query ? true : undefined}><summary>Stored Procedures ({procedures.length})</summary>
        <ul>{procedures.map(name => <li key={name}>{name}</li>)}</ul>
      </details>
      {!tables.length && !views.length && !procedures.length && <p>{query ? '没有匹配的对象。' : '练习库暂无对象。'}</p>}
    </div>}
    <section className="school-table-info" aria-label="Table Information">
      <h3>Table Information</h3>
      {object ? <>
        <p><strong>{object.name}</strong>{'engine' in object && object.engine ? ' · ' + object.engine : ''}</p>
        {property ? <dl>
          <div><dt>字段</dt><dd>{property.name}</dd></div>
          <div><dt>类型</dt><dd>{property.type}</dd></div>
          <div><dt>主键</dt><dd>{property.primaryKey ? '是' : '否'}</dd></div>
          <div><dt>允许 NULL</dt><dd>{property.nullable ? '是' : '否'}</dd></div>
          <div><dt>默认值</dt><dd>{property.defaultValue ?? 'NULL'}</dd></div>
          {property.extra && <div><dt>其他属性</dt><dd>{property.extra}</dd></div>}
        </dl> : <ul>{object.columns.map(column => <li key={column.name}>{column.name} · {column.type}{column.primaryKey && ' · PK'}</li>)}</ul>}
      </> : <p>选择表、视图或字段查看属性。</p>}
    </section>
  </div>;
}
