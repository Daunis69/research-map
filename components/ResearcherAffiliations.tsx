import { ArrowUpRight, ChevronRight } from "lucide-react";
import Image from "next/image";
import researcher from "@/data/researcher.json";

export default function ResearcherAffiliations() {
  return (
    <details className="researcher-affiliations" open>
      <summary>
        <ChevronRight size={14} aria-hidden="true" />
        Affiliations and memberships
      </summary>
      <div className="affiliations-grid">
        <section aria-labelledby="primary-affiliation-title">
          <div className="affiliation-logo">
            <Image src="/logos/cyprus-university.png" alt="" width={147} height={56} unoptimized />
          </div>
          <h2 id="primary-affiliation-title">{researcher.institution}</h2>
          <p className="affiliation-role">{researcher.title}</p>
          <ul>
            {researcher.laboratoryRoles.map(role => <li key={role}>{role}</li>)}
          </ul>
          <p>{researcher.department}</p>
          <p>{researcher.school}</p>
          <a href={researcher.laboratoryUrl} target="_blank" rel="noopener noreferrer">
            CLOTHO Lab website <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </section>
        <section aria-labelledby="visiting-affiliation-title">
          <div className="affiliation-logo">
            <Image src="/logos/aristotle-medicine.png" alt="" width={191} height={180} unoptimized />
          </div>
          <h2 id="visiting-affiliation-title">{researcher.visitingAppointment.institution}</h2>
          <p className="affiliation-role">{researcher.visitingAppointment.title}</p>
          <p>{researcher.visitingAppointment.department}</p>
          <p>{researcher.visitingAppointment.school}</p>
          <p>{researcher.visitingAppointment.address}</p>
        </section>
        <section aria-labelledby="membership-title">
          <div className="affiliation-logo">
            <Image src="/logos/exposome-alliance.png" alt="" width={1200} height={516} unoptimized />
          </div>
          <h2 id="membership-title">{researcher.membership.name}</h2>
          <p className="affiliation-role">Member of the {researcher.membership.name}</p>
          <a href={researcher.membership.url} target="_blank" rel="noopener noreferrer">
            Alliance website <ArrowUpRight size={12} aria-hidden="true" />
          </a>
        </section>
      </div>
    </details>
  );
}
