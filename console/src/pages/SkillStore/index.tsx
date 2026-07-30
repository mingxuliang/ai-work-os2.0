import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAppMessage } from "@/hooks/useAppMessage";
import { CopawWorkbenchShell } from "@/components/CopawWorkbenchShell";
import { api } from "@/api";
import type { MarketSkillSpec } from "@/api/modules/skill";
import { FEATURED_COLLECTIONS, categoryIcon } from "./mocks";
import styles from "./index.module.less";

type StoreSkillView = {
  id: string;
  name: string;
  authorHandle: string;
  category: string;
  tags: string[];
  license?: string;
  description: string;
  instructions: string[];
  installName: string;
};

function toStoreSkill(item: MarketSkillSpec): StoreSkillView {
  return {
    id: item.id,
    name: item.name || item.folder,
    authorHandle: item.author_handle || (item.author ? `@${item.author}` : ""),
    category: item.category,
    tags: item.tags?.length ? item.tags : item.category ? [item.category] : [],
    license: item.license,
    description: item.description || "",
    instructions:
      item.instructions?.length
        ? item.instructions
        : item.description
          ? [item.description]
          : [],
    installName: item.name || item.folder,
  };
}

function HeroBanners({ onRefresh }: { onRefresh: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeSlide, setActiveSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setActiveSlide((prev) => (prev + 1) % FEATURED_COLLECTIONS.length);
  }, []);

  useEffect(() => {
    const timer = setInterval(nextSlide, 4000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  const current = FEATURED_COLLECTIONS[activeSlide];
  const thumbnails = [1, 2, 3].map(
    (i) => FEATURED_COLLECTIONS[(activeSlide + i) % FEATURED_COLLECTIONS.length],
  );

  return (
    <div>
      <div className={styles.brandRow}>
        <div className={styles.brandLeft}>
          <div className={styles.brandMark}>{"/*"}</div>
          <div>
            <div className={styles.brandTitle}>
              AI Work OS{" "}
              <span className={styles.brandAccent}>
                {t("skillStore.brandAccent")}
              </span>
            </div>
            <p className={styles.brandSub}>{t("skillStore.brandSub")}</p>
          </div>
        </div>
        <div className={styles.brandActions}>
          <button
            type="button"
            className={styles.docBtn}
            onClick={onRefresh}
          >
            <i className="ri-refresh-line" />
            {t("skillStore.refreshCatalog")}
          </button>
          <button
            type="button"
            className={styles.docBtn}
            onClick={() => navigate("/skill-pool")}
          >
            <i className="ri-stack-line" />
            {t("skillStore.goSkillPool")}
          </button>
        </div>
      </div>

      <div className={styles.banners}>
        <div className={styles.bannerLeft}>
          <div>
            <h2 className={styles.bannerLeftTitle}>
              {t("skillStore.heroLeftTitle")}
            </h2>
            <p className={styles.bannerLeftSub}>
              {t("skillStore.heroLeftSub")}
            </p>
            <button
              type="button"
              className={styles.bannerLeftBtn}
              onClick={() => navigate("/skill-pool")}
            >
              {t("skillStore.tryIt")}
              <span style={{ fontFamily: "monospace" }}>&lt;_</span>
            </button>
          </div>
          <div className={styles.bannerDecor} aria-hidden>
            {"/*"}
          </div>
        </div>

        <div className={styles.bannerRight}>
          <h2 className={styles.bannerRightTitle}>
            {t("skillStore.heroRightTitle")}{" "}
            <span className={styles.bannerRightTitleMark}>&gt;?</span>
          </h2>
          <div className={styles.featuredRow}>
            <button type="button" className={styles.featuredMain}>
              <div className={styles.featuredIcon}>
                <img src={current.iconImage} alt={current.title} />
              </div>
              <div className={styles.featuredText}>
                <div className={styles.featuredTitle}>{current.title}</div>
                <div className={styles.featuredDesc}>{current.description}</div>
              </div>
              <div className={styles.featuredArrow}>
                <i className="ri-arrow-right-up-line" style={{ fontSize: 12 }} />
              </div>
            </button>
            {thumbnails.map((item, idx) => (
              <div
                key={item.id}
                className={`${styles.thumb} ${idx === 0 ? styles.thumbActive : ""}`}
              >
                <img src={item.coverImage} alt={item.title} />
              </div>
            ))}
          </div>
          <div className={styles.dots}>
            {FEATURED_COLLECTIONS.map((_, idx) => (
              <button
                key={idx}
                type="button"
                className={`${styles.dot} ${
                  idx === activeSlide ? styles.dotActive : ""
                }`}
                onClick={() => setActiveSlide(idx)}
                aria-label={`slide-${idx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SkillCard({
  skill,
  installed,
  installing,
  onInstall,
}: {
  skill: StoreSkillView;
  installed: boolean;
  installing: boolean;
  onInstall: (skill: StoreSkillView) => void;
}) {
  const { t } = useTranslation();
  const [showConfirm, setShowConfirm] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        confirmRef.current &&
        !confirmRef.current.contains(e.target as Node)
      ) {
        setShowConfirm(false);
      }
    }
    if (showConfirm) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showConfirm]);

  const handleConfirm = () => {
    setShowConfirm(false);
    onInstall(skill);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const initial = (skill.name || "?").trim().charAt(0).toUpperCase();

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardIdentity}>
          <div className={styles.cardIconLetter} aria-hidden>
            {initial}
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 className={styles.cardName}>{skill.name}</h3>
            <div className={styles.cardMeta}>
              {skill.authorHandle ? (
                <span>
                  <i className="ri-user-line" />
                  {skill.authorHandle}
                </span>
              ) : null}
              <span>
                <i className="ri-folder-line" />
                {skill.category}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.tags}>
        {skill.tags.map((tag) => (
          <span key={tag} className={styles.tag}>
            {tag}
          </span>
        ))}
        {skill.license ? (
          <span className={`${styles.tag} ${styles.tagLicense}`}>
            {skill.license}
          </span>
        ) : null}
      </div>

      <div className={styles.instructions}>
        {(skill.instructions.length
          ? skill.instructions
          : [skill.description || t("skillStore.noDescription")]
        ).map((inst, idx) => (
          <div key={idx} className={styles.instRow}>
            <span className={styles.instIdx}>
              {String(idx + 1).padStart(2, "0")}
            </span>
            <span className={styles.instText}>{inst}</span>
          </div>
        ))}
      </div>

      <div className={styles.cardFooter}>
        <div ref={confirmRef}>
          {installed || justAdded ? (
            <span className={styles.addedBadge}>
              <i className="ri-check-line" />
              {t("skillStore.installed")}
            </span>
          ) : showConfirm ? (
            <div className={styles.confirmRow}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowConfirm(false)}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className={styles.confirmBtn}
                onClick={handleConfirm}
                disabled={installing}
              >
                {t("skillStore.confirmInstall")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.addBtn}
              onClick={() => setShowConfirm(true)}
              disabled={installing}
            >
              <i className="ri-add-line" />
              {t("skillStore.installToPool")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SkillStorePage() {
  const { t } = useTranslation();
  const { message } = useAppMessage();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; count: number }>
  >([]);
  const [skills, setSkills] = useState<StoreSkillView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [installedNames, setInstalledNames] = useState<Set<string>>(new Set());
  const [sessionInstalledIds, setSessionInstalledIds] = useState<string[]>([]);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [skillDesc, setSkillDesc] = useState("");
  const [formStatus, setFormStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const loadPoolInstalled = useCallback(async () => {
    try {
      const pool = await api.listSkillPoolSkills();
      setInstalledNames(new Set(pool.map((s) => s.name)));
    } catch {
      // pool may be empty / unavailable
    }
  }, []);

  const loadCategories = useCallback(async () => {
    const res = await api.listSkillMarketCategories();
    setCategories(res.categories || []);
  }, []);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.listSkillMarketSkills({
        q: debouncedQuery || undefined,
        category: category === "all" ? undefined : category,
        page: 1,
        page_size: 96,
      });
      setSkills((res.items || []).map(toStoreSkill));
      setTotal(res.total || 0);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(msg || t("skillStore.loadFailed"));
      setSkills([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [category, debouncedQuery, message, t]);

  useEffect(() => {
    void loadPoolInstalled();
  }, [loadPoolInstalled]);

  useEffect(() => {
    void loadCategories().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(msg || t("skillStore.loadFailed"));
    });
  }, [loadCategories, message, t]);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const handleRefresh = async () => {
    try {
      const res = await api.refreshSkillMarket();
      message.success(
        t("skillStore.refreshSuccess", { count: res.count ?? 0 }),
      );
      await loadCategories();
      await loadSkills();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(msg || t("skillStore.refreshFailed"));
    }
  };

  const isInstalled = (skill: StoreSkillView) => {
    const candidates = [
      skill.installName,
      skill.name,
      skill.installName.replace(/\s+/g, "-"),
      skill.name.replace(/\s+/g, "-"),
    ];
    return (
      candidates.some((n) => installedNames.has(n)) ||
      sessionInstalledIds.includes(skill.id)
    );
  };

  const handleInstall = async (skill: StoreSkillView) => {
    setInstallingId(skill.id);
    try {
      const result = await api.installSkillFromMarket({ id: skill.id });
      if (result.installed && result.name) {
        setInstalledNames((prev) => new Set(prev).add(result.name!));
        setSessionInstalledIds((prev) =>
          prev.includes(skill.id) ? prev : [...prev, skill.id],
        );
        message.success(
          t("skillStore.installSuccess", { name: result.name }),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      message.error(msg || t("skillStore.installFailed"));
    } finally {
      setInstallingId(null);
    }
  };

  const handleCreateSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) {
      setFormError(t("skillStore.nameRequired"));
      setFormStatus("error");
      return;
    }
    setFormStatus("success");
    setSkillName("");
    setSkillDesc("");
    setFormError("");
    setTimeout(() => {
      setIsModalOpen(false);
      setFormStatus("idle");
      message.success(t("skillStore.createSuccessHint"));
    }, 1200);
  };

  const categoryTabs = useMemo(() => {
    const allCount = categories.reduce((sum, c) => sum + (c.count || 0), 0);
    return [
      {
        id: "all",
        name: t("skillStore.catAll"),
        icon: "ri-apps-line",
        count: allCount || total,
      },
      ...categories.map((c) => ({
        id: c.id,
        name: c.name,
        icon: categoryIcon(c.name),
        count: c.count,
      })),
    ];
  }, [categories, t, total]);

  return (
    <CopawWorkbenchShell>
      <div className={styles.page}>
        <HeroBanners onRefresh={() => void handleRefresh()} />

        <div className={styles.toolbar}>
          <div className={styles.categoryTabs}>
            {categoryTabs.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`${styles.catTab} ${
                  category === cat.id ? styles.catTabActive : ""
                }`}
                onClick={() => setCategory(cat.id)}
              >
                <i className={cat.icon} />
                {cat.name}
              </button>
            ))}
          </div>
          <div className={styles.toolbarRight}>
            <div className={styles.searchWrap}>
              <i className={`ri-search-line ${styles.searchIcon}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("skillStore.searchPlaceholder", {
                  count: total,
                })}
                className={styles.searchInput}
              />
            </div>
            <button
              type="button"
              className={styles.newBtn}
              onClick={() => setIsModalOpen(true)}
            >
              <i className="ri-add-line" />
              {t("skillStore.newSkill")}
            </button>
          </div>
        </div>

        {sessionInstalledIds.length > 0 ? (
          <div className={styles.toast}>
            <i className="ri-check-line" />
            <span>
              {t("skillStore.installToast", {
                count: sessionInstalledIds.length,
              })}
            </span>
          </div>
        ) : null}

        {loading ? (
          <div className={styles.empty}>
            <p>{t("skillStore.loading")}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {skills.map((skill) => (
              <SkillCard
                key={skill.id}
                skill={skill}
                installed={isInstalled(skill)}
                installing={installingId === skill.id}
                onInstall={handleInstall}
              />
            ))}
          </div>
        )}

        {!loading && skills.length === 0 ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}>
              <i className="ri-search-line" />
            </div>
            <p>{t("skillStore.emptyTitle")}</p>
            <p className={styles.emptyHint}>{t("skillStore.emptyHint")}</p>
          </div>
        ) : null}
      </div>

      {isModalOpen ? (
        <div
          className={styles.modalOverlay}
          onClick={() => setIsModalOpen(false)}
        >
          <div
            className={styles.modalDialog}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>{t("skillStore.newSkill")}</h3>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setIsModalOpen(false)}
              >
                <i className="ri-close-line" />
              </button>
            </div>

            {formStatus === "success" ? (
              <div className={styles.successBox}>
                <div className={styles.successIcon}>
                  <i className="ri-check-line" />
                </div>
                <p>{t("skillStore.createSuccess")}</p>
              </div>
            ) : (
              <form onSubmit={handleCreateSkill}>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    {t("skillStore.skillName")}
                  </label>
                  <input
                    type="text"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                    className={styles.formInput}
                    placeholder={t("skillStore.skillNamePlaceholder")}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>
                    {t("skillStore.skillDesc")}
                  </label>
                  <textarea
                    value={skillDesc}
                    onChange={(e) => setSkillDesc(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className={styles.formTextarea}
                    placeholder={t("skillStore.skillDescPlaceholder")}
                  />
                  <p className={styles.formCount}>{skillDesc.length}/500</p>
                </div>
                {formError ? (
                  <p className={styles.formError}>{formError}</p>
                ) : null}
                <div className={styles.formActions}>
                  <button
                    type="button"
                    className={styles.cancelBtn}
                    onClick={() => setIsModalOpen(false)}
                  >
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className={styles.confirmBtn}>
                    {t("skillStore.create")}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </CopawWorkbenchShell>
  );
}
