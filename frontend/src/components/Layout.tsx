import { AppShell, Group, NavLink, Title, useMantineColorScheme, ActionIcon, Tooltip, Indicator } from "@mantine/core";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  IconDashboard,
  IconHistory,
  IconSettings,
  IconSun,
  IconMoon,
  IconDownload,
} from "@tabler/icons-react";
import { useState } from "react";
import { useUpdater } from "../hooks/useUpdater";
import { UpdateModal } from "./UpdateModal";

const navItems = [
  { label: "Dashboard", icon: IconDashboard, path: "/" },
  { label: "History", icon: IconHistory, path: "/history" },
  { label: "Settings", icon: IconSettings, path: "/settings" },
];

export function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const updater = useUpdater();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);

  return (
    <AppShell navbar={{ width: 220, breakpoint: "sm" }} padding="md">
      <AppShell.Navbar p="sm">
        <Group justify="space-between" mb="md">
          <Title order={4}>scdl-web</Title>
          <Group gap="xs">
            {updater.updateInfo && (
              <Tooltip label={`${updater.updateInfo.version} available`} position="right">
                <Indicator color="blue" size={8} processing>
                  <ActionIcon
                    variant="subtle"
                    color="blue"
                    size="lg"
                    onClick={() => setUpdateModalOpen(true)}
                  >
                    <IconDownload size={18} />
                  </ActionIcon>
                </Indicator>
              </Tooltip>
            )}
            <ActionIcon variant="subtle" onClick={toggleColorScheme} size="lg">
              {colorScheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
            </ActionIcon>
          </Group>
        </Group>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            label={item.label}
            leftSection={<item.icon size={18} />}
            active={
              item.path === "/"
                ? location.pathname === "/" || location.pathname.startsWith("/sources")
                : location.pathname.startsWith(item.path)
            }
            onClick={() => navigate(item.path)}
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <UpdateModal
        opened={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        updater={updater}
      />
    </AppShell>
  );
}
