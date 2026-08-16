import {LoadingOutlined} from '@ant-design/icons';
import {Button, Input, Modal, Table, message} from 'antd';
import type {ColumnsType} from 'antd/es/table';
import {useCallback, useEffect, useRef, useState, type UIEvent} from 'react';
import {useTranslation} from 'react-i18next';
import type {
  RemoteSgfAuthConfig,
  RemoteSgfListItem,
  RemoteSgfSavedLogin,
  RemoteSgfSourceApi,
} from '../../app/remoteSgf';

const initialFetchCount = 20;
const fetchCountStep = 20;

interface RemoteSgfModalProps {
  open: boolean;
  title: string;
  queryLabel: string;
  queryPlaceholder: string;
  loadErrorMessage: string;
  openErrorMessage: string;
  storageKey: string;
  source: RemoteSgfSourceApi;
  auth?: RemoteSgfAuthConfig;
  onCancel: () => void;
  onOpenSgf: (content: string, fileName: string) => Promise<boolean>;
}

export function RemoteSgfModal({
  open,
  title,
  queryLabel,
  queryPlaceholder,
  loadErrorMessage,
  openErrorMessage,
  storageKey,
  source,
  auth,
  onCancel,
  onOpenSgf,
}: RemoteSgfModalProps) {
  const {t, i18n} = useTranslation();
  const requiresAuth = auth != null;
  const [query, setQuery] = useState(() => localStorage.getItem(storageKey) ?? '');
  const [password, setPassword] = useState('');
  const [savedLogin, setSavedLogin] = useState<RemoteSgfSavedLogin | null>(null);
  const [authenticated, setAuthenticated] = useState(auth == null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [loadedQuery, setLoadedQuery] = useState('');
  const [items, setItems] = useState<RemoteSgfListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openingItemId, setOpeningItemId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const submittedQueryRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  const wasOpenRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const nextFetchCountRef = useRef(initialFetchCount + fetchCountStep);
  const canUseSavedPassword =
    savedLogin?.hasPassword === true && savedLogin.username.toLowerCase() === query.trim().toLowerCase();
  const canLogin = query.trim() !== '' && (password !== '' || canUseSavedPassword);
  const queryEditable = auth == null || auth.queryEditableAfterLogin === true;

  const loadQuery = useCallback(
    async (normalizedQuery: string) => {
      if (normalizedQuery === '' || submittedQueryRef.current === normalizedQuery) return;

      submittedQueryRef.current = normalizedQuery;
      localStorage.setItem(storageKey, normalizedQuery);
      const requestId = ++requestIdRef.current;
      loadingMoreRef.current = false;
      nextFetchCountRef.current = initialFetchCount + fetchCountStep;
      setLoading(true);
      setLoadingMore(false);
      setLoadedQuery('');
      setItems([]);
      setNextCursor(null);
      setSelectedItemId(null);
      try {
        const result = await source.list({query: normalizedQuery, limit: initialFetchCount});
        if (requestId !== requestIdRef.current) return;
        setLoadedQuery(result.query);
        setItems(result.items);
        setNextCursor(result.nextCursor);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        submittedQueryRef.current = null;
        message.error(error instanceof Error ? `${loadErrorMessage} ${error.message}` : loadErrorMessage);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [loadErrorMessage, source, storageKey]
  );

  const loadItems = useCallback(() => loadQuery(query.trim()), [loadQuery, query]);

  async function login(): Promise<void> {
    const normalizedQuery = query.trim();
    if (source.login == null || normalizedQuery === '' || (password === '' && !canUseSavedPassword)) return;

    setLoggingIn(true);
    try {
      const result = await source.login(
        password === ''
          ? {username: normalizedQuery, useSavedPassword: true}
          : {username: normalizedQuery, password}
      );
      setPassword('');
      setQuery(result.query);
      if (result.credentialsSaved === true) {
        setSavedLogin({username: result.query, hasPassword: true});
      } else if (result.credentialsSaved === false) {
        setSavedLogin(null);
        if (auth != null) message.warning(auth.credentialsNotSavedMessage);
      }
      setAuthenticated(true);
      submittedQueryRef.current = null;
      await loadQuery(result.query);
    } catch (error) {
      message.error(
        error instanceof Error ? `${auth?.loginErrorMessage ?? ''} ${error.message}` : auth?.loginErrorMessage
      );
    } finally {
      setLoggingIn(false);
    }
  }

  async function loadNextPage(): Promise<void> {
    const cursor = nextCursor;
    if (loadedQuery === '' || cursor == null || loadingMoreRef.current) return;

    const requestId = requestIdRef.current;
    const fetchCount = nextFetchCountRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const result = await source.list({query: loadedQuery, cursor, limit: fetchCount});
      if (requestId !== requestIdRef.current) return;
      setItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [...current, ...result.items.filter((item) => !existingIds.has(item.id))];
      });
      setNextCursor(result.items.length === 0 || result.nextCursor === cursor ? null : result.nextCursor);
      nextFetchCountRef.current += fetchCountStep;
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      message.error(error instanceof Error ? `${loadErrorMessage} ${error.message}` : loadErrorMessage);
    } finally {
      if (requestId === requestIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }

  function handleTableScroll(event: UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget;
    if (element.scrollHeight - element.scrollTop - element.clientHeight <= 32) void loadNextPage();
  }

  useEffect(() => {
    if (open && !wasOpenRef.current && !requiresAuth) {
      submittedQueryRef.current = null;
      void loadItems();
    }
    wasOpenRef.current = open;
  }, [loadItems, open, requiresAuth]);

  const getSavedLogin = source.getSavedLogin;
  useEffect(() => {
    if (!open || authenticated || !requiresAuth || getSavedLogin == null) return;
    let active = true;
    void getSavedLogin().then((result) => {
      if (!active) return;
      setSavedLogin(result);
      if (result != null) setQuery(result.username);
    });
    return () => {
      active = false;
    };
  }, [authenticated, getSavedLogin, open, requiresAuth]);

  async function openItem(item: RemoteSgfListItem): Promise<void> {
    if (loadedQuery === '') return;
    setOpeningItemId(item.id);
    try {
      const result = await source.read({query: loadedQuery, itemId: item.id});
      if (await onOpenSgf(result.content, result.fileName)) onCancel();
    } catch (error) {
      message.error(error instanceof Error ? `${openErrorMessage} ${error.message}` : openErrorMessage);
    } finally {
      setOpeningItemId(null);
    }
  }

  function renderPlayer(item: RemoteSgfListItem, player: 'black' | 'white') {
    const name = player === 'black' ? item.blackName : item.whiteName;
    const rank = player === 'black' ? item.blackRank : item.whiteRank;
    const outcomeClass =
      item.queryPlayer === player && (item.queryOutcome === 'win' || item.queryOutcome === 'loss')
        ? ` remote-sgf-player-${item.queryOutcome}`
        : '';
    return (
      <span className="remote-sgf-player">
        <strong className={`remote-sgf-player-name${outcomeClass}`}>{name}</strong>
        <em className="remote-sgf-player-rank">{rank}</em>
      </span>
    );
  }

  const columns: ColumnsType<RemoteSgfListItem> = [
    {
      title: t('date'),
      dataIndex: 'startTime',
      width: 180,
      render: (startTime: string) =>
        new Intl.DateTimeFormat(i18n.language, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(startTime)),
    },
    {title: t('black'), render: (_, item) => renderPlayer(item, 'black')},
    {title: t('white'), render: (_, item) => renderPlayer(item, 'white')},
    {title: t('boardSize'), dataIndex: 'boardSize', width: 90},
    {title: t('result'), dataIndex: 'result', width: 90},
  ];

  const selectedItem = selectedItemId == null ? null : (items.find((item) => item.id === selectedItemId) ?? null);

  return (
    <Modal
      className={authenticated ? 'remote-sgf-modal' : undefined}
      centered
      open={open}
      title={title}
      width={760}
      footer={
        !authenticated ? (
          <Button
            type="primary"
            loading={loggingIn}
            disabled={!canLogin}
            onClick={() => void login()}
          >
            {auth?.loginLabel}
          </Button>
        ) : (
          <div className="remote-sgf-footer">
            <span className="remote-sgf-loading" style={{visibility: loading || loadingMore ? 'visible' : 'hidden'}}>
              <LoadingOutlined spin />
              {t('loading')}
            </span>
            <Button
              type="primary"
              disabled={selectedItem == null}
              loading={openingItemId != null}
              style={{visibility: selectedItem == null ? 'hidden' : 'visible'}}
              onClick={() => {
                if (selectedItem != null) void openItem(selectedItem);
              }}
            >
              {t('open')}
            </Button>
          </div>
        )
      }
      onCancel={onCancel}
    >
      {!authenticated ? (
        <div className="remote-sgf-login">
          <label>
            <span>{queryLabel}</span>
            <Input
              autoFocus
              autoComplete="username"
              placeholder={queryPlaceholder}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>{auth?.passwordLabel}</span>
            <Input.Password
              autoComplete="current-password"
              placeholder={canUseSavedPassword ? auth?.savedPasswordPlaceholder : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onPressEnter={() => void login()}
            />
          </label>
        </div>
      ) : (
        <div className="remote-sgf-content">
          <Input
            aria-label={queryLabel}
            placeholder={queryPlaceholder}
            value={query}
            readOnly={!queryEditable}
            onChange={queryEditable ? (event) => setQuery(event.target.value) : undefined}
            onPressEnter={queryEditable ? () => void loadItems() : undefined}
            onBlur={queryEditable ? () => void loadItems() : undefined}
          />
          <Table
            className="remote-sgf-table"
            size="small"
            rowKey="id"
            pagination={false}
            scroll={{y: '100%'}}
            columns={columns}
            dataSource={items}
            onScroll={handleTableScroll}
            rowSelection={{
              type: 'radio',
              selectedRowKeys: selectedItemId == null ? [] : [selectedItemId],
              onSelect: (item) => setSelectedItemId(item.id),
            }}
            onRow={(item) => ({
              onClick: () => setSelectedItemId(item.id),
              onDoubleClick: () => {
                setSelectedItemId(item.id);
                void openItem(item);
              },
            })}
          />
        </div>
      )}
    </Modal>
  );
}
