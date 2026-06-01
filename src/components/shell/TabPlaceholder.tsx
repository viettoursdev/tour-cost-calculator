import { Alert, Box, Button } from '@mui/material';

type Props = { tabKey: string; label: string };

export function TabPlaceholder({ tabKey, label }: Props) {
  const legacyUrl = `/tour-cost-calculator/legacy.html#tab=${encodeURIComponent(tabKey)}`;
  return (
    <Box sx={{ p: 4 }}>
      <Alert
        severity="info"
        action={
          <Button color="inherit" size="small" href={legacyUrl}>
            Mở trong bản cũ →
          </Button>
        }
      >
        Tab <strong>{label}</strong> đang được di chuyển sang phiên bản mới. Tạm thời sử dụng bản cũ.
      </Alert>
    </Box>
  );
}
