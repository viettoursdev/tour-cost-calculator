import { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { DEPT_LABEL } from '@/auth/departments';
import type { HrEmployee } from '@/types';

type Node = { emp: HrEmployee; children: Node[] };

/** Dựng rừng cây từ managerId. Nhân viên có managerId không khớp ai → coi như gốc. */
function buildForest(employees: HrEmployee[]): Node[] {
  const byId = new Map(employees.map((e) => [e.id, e]));
  const nodes = new Map<string, Node>(employees.map((e) => [e.id, { emp: e, children: [] }]));
  const roots: Node[] = [];
  for (const e of employees) {
    const node = nodes.get(e.id)!;
    const parent = e.managerId && byId.has(e.managerId) ? nodes.get(e.managerId) : undefined;
    if (parent && parent.emp.id !== e.id) parent.children.push(node);
    else roots.push(node);
  }
  const sortRec = (list: Node[]) => {
    list.sort((a, b) => a.emp.fullName.localeCompare(b.emp.fullName));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

function Card({ emp, onClick }: { emp: HrEmployee; onClick?: () => void }) {
  return (
    <Paper
      variant="outlined"
      onClick={onClick}
      sx={{ px: 1.5, py: 0.75, cursor: onClick ? 'pointer' : 'default', minWidth: 180, '&:hover': onClick ? { borderColor: 'primary.main' } : undefined }}
    >
      <Typography fontWeight={700} fontSize={14} noWrap>{emp.fullName}</Typography>
      <Typography variant="caption" color="text.secondary" noWrap>
        {emp.title || '—'}{emp.department ? ` · ${DEPT_LABEL[emp.department as keyof typeof DEPT_LABEL] ?? emp.department}` : ''}
      </Typography>
    </Paper>
  );
}

function TreeNode({ node, onPick }: { node: Node; onPick: (e: HrEmployee) => void }) {
  return (
    <Box sx={{ ml: 0 }}>
      <Card emp={node.emp} onClick={() => onPick(node.emp)} />
      {node.children.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1, ml: 3, pl: 2, borderLeft: '2px solid', borderColor: 'divider' }}>
          {node.children.map((c) => <TreeNode key={c.emp.id} node={c} onPick={onPick} />)}
        </Stack>
      )}
    </Box>
  );
}

export function OrgChart({ employees, onPick }: { employees: HrEmployee[]; onPick: (e: HrEmployee) => void }) {
  const forest = useMemo(() => buildForest(employees), [employees]);
  if (!employees.length) return <Typography color="text.secondary">Chưa có nhân sự để dựng sơ đồ.</Typography>;
  return (
    <Stack spacing={2}>
      {forest.map((root) => <TreeNode key={root.emp.id} node={root} onPick={onPick} />)}
    </Stack>
  );
}
