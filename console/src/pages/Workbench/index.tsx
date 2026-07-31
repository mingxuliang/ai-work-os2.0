import { useEffect, useMemo, useState } from "react";
import { Spin } from "antd";
import { useTranslation } from "react-i18next";
import { departmentApi } from "../../api/modules/department";
import {
  getDisplayUsernameFromToken,
  parseJwtPayload,
} from "../../utils/authUsername";
import { getSummonedAgentIds } from "../../utils/agentPresentationStorage";
import { useWorkbench } from "./useWorkbench";
import AgentStatusGrid from "./components/AgentStatusGrid";
import ActivityFeed from "./components/ActivityFeed";
import AITeamSection from "./components/AITeamSection";
import WorkbenchStatCards from "./components/WorkbenchStatCards";
import WelcomeBanner from "./components/WelcomeBanner";

export default function WorkbenchPage() {
  const { t } = useTranslation();
  const { agents, todayStats, recentChats, loading } = useWorkbench();
  const displayName = useMemo(() => getDisplayUsernameFromToken(), []);
  const [deptName, setDeptName] = useState("");
  const [positionTitle, setPositionTitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const payload = parseJwtPayload();
        const userId = Number(payload?.sub);
        if (!Number.isFinite(userId) || userId <= 0) return;
        const assignment = await departmentApi.getUserDepartment(userId);
        if (!assignment.department_id) {
          if (!cancelled) {
            setDeptName("");
            setPositionTitle("");
          }
          return;
        }
        const dept = await departmentApi.getOne(assignment.department_id);
        if (!cancelled) {
          setDeptName(dept.department_name || "");
          setPositionTitle(dept.position_title || "");
        }
      } catch {
        if (!cancelled) {
          setDeptName("");
          setPositionTitle("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Only agents in「我的 AI 团队」(summoned), same as chat selector / MyTeam page
  const filteredAgents = useMemo(() => {
    const summonedIds = getSummonedAgentIds();
    return agents.filter((a) => summonedIds.has(a.id));
  }, [agents]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Spin tip={t("common.loading")} />
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          <WelcomeBanner
            displayName={displayName}
            deptName={deptName}
            positionTitle={positionTitle}
            welcomeText={t("workbench.welcome", {
              name: displayName,
              defaultValue: `欢迎 ${displayName} 登录`,
            })}
            deptLabel={t("workbench.welcomeDeptPrefix", "部门：")}
            positionLabel={t("workbench.welcomePositionPrefix", "岗位：")}
            unknownLabel={t("workbench.welcomePositionUnknown", "未分配岗位")}
          />

          <WorkbenchStatCards agents={filteredAgents} todayStats={todayStats} />

          <div
            style={{
              flexShrink: 0,
              padding: "0 24px 16px",
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: 16,
              height: 320,
            }}
          >
            <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
              <AgentStatusGrid agents={filteredAgents} />
            </div>
            <div style={{ height: "100%", minHeight: 0, overflow: "hidden" }}>
              <ActivityFeed recentChats={recentChats} />
            </div>
          </div>

          <AITeamSection agents={filteredAgents} />
        </div>
      )}
    </div>
  );
}
