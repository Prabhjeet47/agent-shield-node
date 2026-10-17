import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Box, Button, Card, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, IconButton, InputAdornment, List, ListItem, ListItemButton,
  ListItemIcon, ListItemText, Stack, TextField, Tooltip, Typography,
} from '@mui/material'
import GitHubIcon from '@mui/icons-material/GitHub'
import LockIcon from '@mui/icons-material/LockOutlined'
import SearchIcon from '@mui/icons-material/Search'
import DeleteIcon from '@mui/icons-material/DeleteOutlined'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { api } from '../api.js'

const ERRORS = {
  expired: 'The GitHub link expired. Click Connect GitHub to try again.',
  missing_installation: 'GitHub did not send an installation. Please try again.',
}

// Reads what the backend put on the URL after GitHub sent the user back, then cleans the URL.
// Runs once when the module loads, so React's double effects in dev can't lose the values.
function readReturnParams() {
  const params = new URLSearchParams(window.location.search)
  const result = {
    installationId: params.get('installation_id'),
    pending: params.get('github_pending') === '1',
    error: params.get('github_error'),
  }
  if (result.installationId || result.pending || result.error) {
    window.history.replaceState(null, '', window.location.pathname)
  }
  return result
}
const returned = readReturnParams()

// Loads the repos GitHub granted and pre-selects them for the picker.
async function loadPicker(installationId) {
  const { account, repositories } = await api.listGrantedRepos(installationId)
  const selected = new Set(repositories.filter((r) => r.connected).map((r) => r.id))
  // First connection: pre-select everything the user just granted.
  if (selected.size === 0) repositories.forEach((r) => selected.add(r.id))
  return { installationId, account, repos: repositories, selected }
}

export default function ConnectGitHub() {
  const [connected, setConnected] = useState([])
  const [loading, setLoading] = useState(true)
  const [redirecting, setRedirecting] = useState(false)
  const [error, setError] = useState(() =>
    returned.error ? ERRORS[returned.error] ?? 'Could not connect to GitHub.' : '')
  const [notice, setNotice] = useState(() =>
    returned.pending ? 'Request sent. An owner of your GitHub organization needs to approve it.' : '')
  const [picker, setPicker] = useState(null) // { installationId, account, repos, selected:Set }

  useEffect(() => {
    api.listConnectedRepos()
      .then(({ repositories }) => setConnected(repositories))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))

    if (returned.installationId) {
      loadPicker(Number(returned.installationId))
        .then(setPicker)
        .catch((e) => setError(e.message))
    }
  }, [])

  async function connectGitHub() {
    setRedirecting(true)
    setError('')
    try {
      const { url } = await api.getInstallUrl()
      window.location.assign(url) // GitHub's page: choose account and repos
    } catch (e) {
      setError(e.message)
      setRedirecting(false)
    }
  }

  async function savePicker(installationId, ids) {
    const { repositories } = await api.saveRepos(installationId, ids)
    setConnected(repositories)
    setPicker(null)
    setNotice(`Connected ${ids.length} ${ids.length === 1 ? 'repository' : 'repositories'}. The first scan starts shortly.`)
  }

  async function disconnect(repo) {
    try {
      await api.disconnectRepo(repo.id)
      setConnected((list) => list.filter((r) => r.id !== repo.id))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-end' } }}>
        <Box>
          <Typography variant="h4" component="h1" sx={{ fontWeight: 700 }}>Repositories</Typography>
          <Typography color="text.secondary">The GitHub repositories AgentShield is watching.</Typography>
        </Box>
        <Button
          variant="contained" size="large" onClick={connectGitHub} disabled={redirecting}
          startIcon={redirecting ? <CircularProgress size={18} color="inherit" /> : <GitHubIcon />}
        >
          {redirecting ? 'Opening GitHub…' : connected.length ? 'Add or change repositories' : 'Connect GitHub'}
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice('')}>{notice}</Alert>}

      <Card variant="outlined" sx={{ borderRadius: 4 }}>
        {loading ? (
          <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>
        ) : connected.length === 0 ? (
          <Box sx={{ p: 5, textAlign: 'center' }}>
            <GitHubIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
            <Typography variant="h6" sx={{ mt: 1 }}>No repositories yet</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Connect GitHub and choose the repositories you want AgentShield to check.
            </Typography>
            <Button variant="contained" onClick={connectGitHub} startIcon={<GitHubIcon />}>Connect GitHub</Button>
          </Box>
        ) : (
          <List disablePadding>
            {connected.map((repo) => (
              <ListItem
                key={repo.id} divider
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Open on GitHub">
                      <IconButton href={repo.htmlUrl} target="_blank" rel="noreferrer" aria-label={`Open ${repo.fullName} on GitHub`}>
                        <OpenInNewIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Stop watching">
                      <IconButton onClick={() => disconnect(repo)} aria-label={`Disconnect ${repo.fullName}`}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemIcon><GitHubIcon /></ListItemIcon>
                <ListItemText
                  primary={<Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <span>{repo.fullName}</span>
                    {repo.private && <Chip size="small" icon={<LockIcon />} label="Private" />}
                  </Stack>}
                  secondary={`Default branch: ${repo.defaultBranch}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Card>

      {picker && <RepoPicker picker={picker} onClose={() => setPicker(null)} onSave={savePicker} />}
    </Stack>
  )
}

function RepoPicker({ picker, onClose, onSave }) {
  const [selected, setSelected] = useState(picker.selected)
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const visible = useMemo(
    () => picker.repos.filter((r) => r.fullName.toLowerCase().includes(query.toLowerCase())),
    [picker.repos, query],
  )

  const toggle = (id) => setSelected((s) => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  async function save() {
    setSaving(true)
    setError('')
    try {
      await onSave(picker.installationId, [...selected])
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Choose repositories to watch</DialogTitle>
      <DialogContent dividers>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          GitHub gave AgentShield access to these repositories in <b>{picker.account}</b>.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {picker.repos.length > 6 && (
          <TextField
            fullWidth size="small" placeholder="Search repositories" value={query}
            onChange={(e) => setQuery(e.target.value)} sx={{ mb: 1 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          />
        )}
        {picker.repos.length === 0 ? (
          <Alert severity="info">No repositories were shared. Click Add or change repositories to pick some on GitHub.</Alert>
        ) : (
          <List dense>
            {visible.map((repo) => (
              <ListItemButton key={repo.id} onClick={() => toggle(repo.id)}>
                <ListItemIcon>
                  <Checkbox edge="start" checked={selected.has(repo.id)} tabIndex={-1} disableRipple
                    slotProps={{ input: { 'aria-label': repo.fullName } }} />
                </ListItemIcon>
                <ListItemText primary={repo.fullName} secondary={repo.private ? 'Private' : 'Public'} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button variant="contained" onClick={save} disabled={saving || selected.size === 0}>
          {saving ? 'Saving…' : `Connect ${selected.size} ${selected.size === 1 ? 'repository' : 'repositories'}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
