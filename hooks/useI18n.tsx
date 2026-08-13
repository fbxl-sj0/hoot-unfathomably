/*
    Project: Hoot Unfathomably
    --------------------------

    File: useI18n.tsx

    Purpose:

        Resolve user-selected or device language strings for the native app.

    Responsibilities:

        - Select English, French, or Spanish from persisted settings
        - Fall back safely when a device language or message is unavailable
        - Provide simple named-value interpolation for accessible labels

    This file intentionally does NOT contain:

        - date or number formatting
        - settings persistence
        - server-provided text translation
*/

import { getLocales } from "expo-localization";
import React, {
  createContext,
  ReactNode,
  useCallback,
  useContext,
} from "react";
import { useSelector } from "react-redux";

import type { RootState } from "../store/reduxStore";

const english = {
  "nav.timeline": "Timeline",
  "nav.groupFeed": "Group feed",
  "nav.groups": "Groups",
  "nav.newPost": "New post",
  "nav.notifications": "Notifications",
  "nav.more": "More",
  "nav.discussion": "Discussion",
  "nav.people": "People",
  "nav.savedPosts": "Saved posts",
  "nav.drafts": "Drafts",
  "nav.scheduledPosts": "Scheduled posts",
  "nav.lists": "Lists",
  "nav.contentFilters": "Content filters",
  "nav.postActions": "Post actions",
  "nav.report": "Report",
  "nav.anotherAccount": "Use another account",
  "nav.editProfile": "Edit profile",
  "nav.notificationPreferences": "Notification preferences",
  "nav.image": "Image",
  "nav.media": "Media",
  "nav.group": "Group",
  "nav.worlds": "Worlds",
  "nav.myBooks": "My books",
  "nav.bookActivity": "Book activity",
  "nav.gpsPaths": "GPS paths",
  "nav.feeds": "Feeds",
  "nav.feed": "Feed",
  "nav.worldItem": "World item",
  "nav.yourProfile": "Your profile",
  "nav.settings": "Settings",
  "nav.notFound": "Oops!",
  "nav.changeSort": "Change feed sort",
  "more.profile": "Your profile and posts",
  "more.peopleDescription": "Find accounts, follow people, and review requests",
  "more.savedDescription": "Return to posts you bookmarked",
  "more.draftsDescription": "Continue posts saved for this account",
  "more.scheduledDescription": "Review, reschedule, or cancel pending posts",
  "more.listsDescription": "Focused timelines from accounts you follow",
  "more.filtersDescription": "Warn about or hide words and phrases",
  "more.worldsDescription":
    "Books, media, events, software, communities, and more",
  "more.booksDescription": "Reading shelves, progress, reviews, and quotations",
  "more.routesDescription": "Record, import, export, and publish Routes tracks",
  "more.sources": "Feeds and sources",
  "more.sourcesDescription": "Follow publications and federated feeds",
  "more.appSettings": "App settings",
  "compose.edit": "Edit post",
  "compose.reply": "Reply",
  "compose.quote": "Quote repost",
  "compose.group": "New group post",
  "compose.new": "New post",
  "compose.openDrafts": "Open saved drafts",
  "compose.drafts": "Drafts",
  "compose.savedOnDevice": "Draft saved on this device.",
  "compose.replyingTo": "Replying to",
  "compose.quoting": "Quoting",
  "compose.loadingPost": "Loading post…",
  "compose.postTo": "Post to",
  "compose.postToFeed": "Post to my feed",
  "compose.myFeed": "My feed",
  "compose.visibility": "Visibility",
  "compose.public": "Public",
  "compose.unlisted": "Quiet public",
  "compose.followers": "Followers",
  "compose.mentioned": "Mentioned people",
  "compose.contentWarning": "Content warning",
  "compose.sensitiveMedia": "Sensitive media",
  "compose.poll": "Poll",
  "compose.warningText": "Content warning text",
  "compose.warningPlaceholder": "Brief content warning",
  "compose.postText": "Post text",
  "compose.replyPlaceholder": "Write a reply",
  "compose.quotePlaceholder": "Add your thoughts",
  "compose.postPlaceholder": "What's happening?",
  "compose.language": "Post language",
  "compose.languagePlaceholder": "Language, for example en",
  "compose.media": "Media",
  "compose.fourAttachments": "4 attachments",
  "compose.addMedia": "Add image or video",
  "compose.video": "Video",
  "compose.attachmentDescription": "Description for attachment {number}",
  "compose.mediaDescriptionPlaceholder":
    "Describe this media for people who cannot see it",
  "compose.removeAttachment": "Remove attachment {number}",
  "compose.remove": "Remove",
  "compose.altReminder":
    "Add a description to each attachment so screen-reader users know what it contains.",
  "compose.pollMediaConflict":
    "Polls and media cannot be attached to the same post.",
  "compose.futureTime": "Choose a time at least five minutes in the future.",
  "compose.saveDraft": "Save draft",
  "compose.saving": "Saving...",
  "compose.saveChanges": "Save changes",
  "compose.schedule": "Schedule",
  "compose.publishQuote": "Publish quote",
  "compose.publishAccounts": "Publish to {count} accounts",
  "compose.publish": "Publish",
  "actions.translate": "Translate",
  "actions.translateHelp":
    "Translation is requested from your server. Leave the language blank to use its default.",
  "actions.targetLanguage": "Translation target language",
  "actions.languagePlaceholder": "Language code, for example en or fr",
  "actions.translating": "Translating...",
  "actions.translatePost": "Translate post",
  "actions.postActions": "Post actions",
  "actions.edit": "Edit this post",
  "actions.otherAccount": "React from another account",
  "actions.share": "Share post",
  "actions.openBrowser": "Open original in browser",
  "actions.safety": "Safety",
  "actions.reportPost": "Report this post",
  "actions.reportAccount": "Report this account",
} as const;

type MessageKey = keyof typeof english;
type Catalog = Record<MessageKey, string>;

const french: Catalog = {
  "nav.timeline": "Fil d’actualité",
  "nav.groupFeed": "Fil des groupes",
  "nav.groups": "Groupes",
  "nav.newPost": "Nouvelle publication",
  "nav.notifications": "Notifications",
  "nav.more": "Plus",
  "nav.discussion": "Discussion",
  "nav.people": "Personnes",
  "nav.savedPosts": "Publications enregistrées",
  "nav.drafts": "Brouillons",
  "nav.scheduledPosts": "Publications planifiées",
  "nav.lists": "Listes",
  "nav.contentFilters": "Filtres de contenu",
  "nav.postActions": "Actions de publication",
  "nav.report": "Signaler",
  "nav.anotherAccount": "Utiliser un autre compte",
  "nav.editProfile": "Modifier le profil",
  "nav.notificationPreferences": "Préférences de notification",
  "nav.image": "Image",
  "nav.media": "Média",
  "nav.group": "Groupe",
  "nav.worlds": "Mondes",
  "nav.myBooks": "Mes livres",
  "nav.bookActivity": "Activité de lecture",
  "nav.gpsPaths": "Parcours GPS",
  "nav.feeds": "Sources",
  "nav.feed": "Source",
  "nav.worldItem": "Élément du monde",
  "nav.yourProfile": "Votre profil",
  "nav.settings": "Paramètres",
  "nav.notFound": "Oups!",
  "nav.changeSort": "Changer le tri du fil",
  "more.profile": "Votre profil et vos publications",
  "more.peopleDescription":
    "Trouver des comptes, suivre des personnes et examiner les demandes",
  "more.savedDescription": "Revenir aux publications enregistrées",
  "more.draftsDescription":
    "Continuer les publications enregistrées pour ce compte",
  "more.scheduledDescription":
    "Examiner, replanifier ou annuler les publications",
  "more.listsDescription": "Fils ciblés provenant des comptes suivis",
  "more.filtersDescription": "Avertir ou masquer des mots et expressions",
  "more.worldsDescription":
    "Livres, médias, événements, logiciels, communautés et plus",
  "more.booksDescription": "Étagères, progression, critiques et citations",
  "more.routesDescription":
    "Enregistrer, importer, exporter et publier des parcours",
  "more.sources": "Sources et publications",
  "more.sourcesDescription": "Suivre des publications et des sources fédérées",
  "more.appSettings": "Paramètres de l’application",
  "compose.edit": "Modifier la publication",
  "compose.reply": "Répondre",
  "compose.quote": "Citer la publication",
  "compose.group": "Nouvelle publication de groupe",
  "compose.new": "Nouvelle publication",
  "compose.openDrafts": "Ouvrir les brouillons enregistrés",
  "compose.drafts": "Brouillons",
  "compose.savedOnDevice": "Brouillon enregistré sur cet appareil.",
  "compose.replyingTo": "En réponse à",
  "compose.quoting": "Citation de",
  "compose.loadingPost": "Chargement de la publication…",
  "compose.postTo": "Publier dans",
  "compose.postToFeed": "Publier dans mon fil",
  "compose.myFeed": "Mon fil",
  "compose.visibility": "Visibilité",
  "compose.public": "Public",
  "compose.unlisted": "Public discret",
  "compose.followers": "Abonnés",
  "compose.mentioned": "Personnes mentionnées",
  "compose.contentWarning": "Avertissement de contenu",
  "compose.sensitiveMedia": "Média sensible",
  "compose.poll": "Sondage",
  "compose.warningText": "Texte de l’avertissement de contenu",
  "compose.warningPlaceholder": "Bref avertissement de contenu",
  "compose.postText": "Texte de la publication",
  "compose.replyPlaceholder": "Écrire une réponse",
  "compose.quotePlaceholder": "Ajouter votre commentaire",
  "compose.postPlaceholder": "Quoi de neuf?",
  "compose.language": "Langue de la publication",
  "compose.languagePlaceholder": "Langue, par exemple fr",
  "compose.media": "Média",
  "compose.fourAttachments": "4 pièces jointes",
  "compose.addMedia": "Ajouter une image ou une vidéo",
  "compose.video": "Vidéo",
  "compose.attachmentDescription": "Description de la pièce jointe {number}",
  "compose.mediaDescriptionPlaceholder":
    "Décrire ce média pour les personnes qui ne peuvent pas le voir",
  "compose.removeAttachment": "Retirer la pièce jointe {number}",
  "compose.remove": "Retirer",
  "compose.altReminder":
    "Ajoutez une description à chaque pièce jointe pour les utilisateurs de lecteurs d’écran.",
  "compose.pollMediaConflict":
    "Un sondage et un média ne peuvent pas être joints à la même publication.",
  "compose.futureTime":
    "Choisissez une heure située au moins cinq minutes dans le futur.",
  "compose.saveDraft": "Enregistrer le brouillon",
  "compose.saving": "Enregistrement...",
  "compose.saveChanges": "Enregistrer les modifications",
  "compose.schedule": "Planifier",
  "compose.publishQuote": "Publier la citation",
  "compose.publishAccounts": "Publier sur {count} comptes",
  "compose.publish": "Publier",
  "actions.translate": "Traduire",
  "actions.translateHelp":
    "La traduction est demandée à votre serveur. Laissez la langue vide pour utiliser son réglage par défaut.",
  "actions.targetLanguage": "Langue cible de la traduction",
  "actions.languagePlaceholder": "Code de langue, par exemple fr ou en",
  "actions.translating": "Traduction...",
  "actions.translatePost": "Traduire la publication",
  "actions.postActions": "Actions de publication",
  "actions.edit": "Modifier cette publication",
  "actions.otherAccount": "Réagir depuis un autre compte",
  "actions.share": "Partager la publication",
  "actions.openBrowser": "Ouvrir l’original dans le navigateur",
  "actions.safety": "Sécurité",
  "actions.reportPost": "Signaler cette publication",
  "actions.reportAccount": "Signaler ce compte",
};

const spanish: Catalog = {
  "nav.timeline": "Cronología",
  "nav.groupFeed": "Cronología de grupos",
  "nav.groups": "Grupos",
  "nav.newPost": "Nueva publicación",
  "nav.notifications": "Notificaciones",
  "nav.more": "Más",
  "nav.discussion": "Conversación",
  "nav.people": "Personas",
  "nav.savedPosts": "Publicaciones guardadas",
  "nav.drafts": "Borradores",
  "nav.scheduledPosts": "Publicaciones programadas",
  "nav.lists": "Listas",
  "nav.contentFilters": "Filtros de contenido",
  "nav.postActions": "Acciones de publicación",
  "nav.report": "Denunciar",
  "nav.anotherAccount": "Usar otra cuenta",
  "nav.editProfile": "Editar perfil",
  "nav.notificationPreferences": "Preferencias de notificaciones",
  "nav.image": "Imagen",
  "nav.media": "Contenido multimedia",
  "nav.group": "Grupo",
  "nav.worlds": "Mundos",
  "nav.myBooks": "Mis libros",
  "nav.bookActivity": "Actividad de lectura",
  "nav.gpsPaths": "Rutas GPS",
  "nav.feeds": "Fuentes",
  "nav.feed": "Fuente",
  "nav.worldItem": "Elemento del mundo",
  "nav.yourProfile": "Tu perfil",
  "nav.settings": "Ajustes",
  "nav.notFound": "¡Vaya!",
  "nav.changeSort": "Cambiar el orden de la cronología",
  "more.profile": "Tu perfil y publicaciones",
  "more.peopleDescription":
    "Buscar cuentas, seguir personas y revisar solicitudes",
  "more.savedDescription": "Volver a las publicaciones guardadas",
  "more.draftsDescription":
    "Continuar publicaciones guardadas para esta cuenta",
  "more.scheduledDescription": "Revisar, reprogramar o cancelar publicaciones",
  "more.listsDescription": "Cronologías específicas de cuentas que sigues",
  "more.filtersDescription": "Avisar u ocultar palabras y frases",
  "more.worldsDescription":
    "Libros, contenido multimedia, eventos, software, comunidades y más",
  "more.booksDescription": "Estanterías, progreso, reseñas y citas",
  "more.routesDescription": "Grabar, importar, exportar y publicar rutas",
  "more.sources": "Fuentes y publicaciones",
  "more.sourcesDescription": "Seguir publicaciones y fuentes federadas",
  "more.appSettings": "Ajustes de la aplicación",
  "compose.edit": "Editar publicación",
  "compose.reply": "Responder",
  "compose.quote": "Citar publicación",
  "compose.group": "Nueva publicación de grupo",
  "compose.new": "Nueva publicación",
  "compose.openDrafts": "Abrir borradores guardados",
  "compose.drafts": "Borradores",
  "compose.savedOnDevice": "Borrador guardado en este dispositivo.",
  "compose.replyingTo": "En respuesta a",
  "compose.quoting": "Citando",
  "compose.loadingPost": "Cargando publicación…",
  "compose.postTo": "Publicar en",
  "compose.postToFeed": "Publicar en mi cronología",
  "compose.myFeed": "Mi cronología",
  "compose.visibility": "Visibilidad",
  "compose.public": "Público",
  "compose.unlisted": "Público discreto",
  "compose.followers": "Seguidores",
  "compose.mentioned": "Personas mencionadas",
  "compose.contentWarning": "Advertencia de contenido",
  "compose.sensitiveMedia": "Contenido multimedia sensible",
  "compose.poll": "Encuesta",
  "compose.warningText": "Texto de la advertencia de contenido",
  "compose.warningPlaceholder": "Advertencia breve de contenido",
  "compose.postText": "Texto de la publicación",
  "compose.replyPlaceholder": "Escribe una respuesta",
  "compose.quotePlaceholder": "Añade tus comentarios",
  "compose.postPlaceholder": "¿Qué está pasando?",
  "compose.language": "Idioma de la publicación",
  "compose.languagePlaceholder": "Idioma, por ejemplo es",
  "compose.media": "Contenido multimedia",
  "compose.fourAttachments": "4 archivos adjuntos",
  "compose.addMedia": "Añadir imagen o vídeo",
  "compose.video": "Vídeo",
  "compose.attachmentDescription": "Descripción del archivo adjunto {number}",
  "compose.mediaDescriptionPlaceholder":
    "Describe este contenido para las personas que no pueden verlo",
  "compose.removeAttachment": "Quitar archivo adjunto {number}",
  "compose.remove": "Quitar",
  "compose.altReminder":
    "Añade una descripción a cada archivo adjunto para los usuarios de lectores de pantalla.",
  "compose.pollMediaConflict":
    "No se puede adjuntar una encuesta y contenido multimedia a la misma publicación.",
  "compose.futureTime": "Elige una hora al menos cinco minutos en el futuro.",
  "compose.saveDraft": "Guardar borrador",
  "compose.saving": "Guardando...",
  "compose.saveChanges": "Guardar cambios",
  "compose.schedule": "Programar",
  "compose.publishQuote": "Publicar cita",
  "compose.publishAccounts": "Publicar en {count} cuentas",
  "compose.publish": "Publicar",
  "actions.translate": "Traducir",
  "actions.translateHelp":
    "La traducción se solicita a tu servidor. Deja el idioma vacío para usar su opción predeterminada.",
  "actions.targetLanguage": "Idioma de destino de la traducción",
  "actions.languagePlaceholder": "Código de idioma, por ejemplo es o en",
  "actions.translating": "Traduciendo...",
  "actions.translatePost": "Traducir publicación",
  "actions.postActions": "Acciones de publicación",
  "actions.edit": "Editar esta publicación",
  "actions.otherAccount": "Reaccionar desde otra cuenta",
  "actions.share": "Compartir publicación",
  "actions.openBrowser": "Abrir original en el navegador",
  "actions.safety": "Seguridad",
  "actions.reportPost": "Denunciar esta publicación",
  "actions.reportAccount": "Denunciar esta cuenta",
};

function deviceLanguage(): "en" | "es" | "fr" {
  const language = getLocales()[0]?.languageCode?.toLowerCase();
  return language === "es" || language === "fr" ? language : "en";
}

export function translate(
  locale: "system" | "en" | "es" | "fr",
  key: MessageKey,
  values: Record<string, string | number> = {},
): string {
  const resolvedLocale = locale === "system" ? deviceLanguage() : locale;
  const catalog =
    resolvedLocale === "fr"
      ? french
      : resolvedLocale === "es"
        ? spanish
        : english;
  return (catalog[key] || english[key]).replace(
    /\{(\w+)\}/g,
    (match, name: string) =>
      values[name] === undefined ? match : String(values[name]),
  );
}

const LocaleContext = createContext<"system" | "en" | "es" | "fr">("en");

export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSelector((state: RootState) => state.settings.locale);
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export default function useI18n() {
  const locale = useContext(LocaleContext);
  const t = useCallback(
    (key: MessageKey, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    [locale],
  );
  return { locale, t };
}

/* end of useI18n.tsx */
