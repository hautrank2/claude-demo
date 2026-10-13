# Northwind Robotics — Annual Cross-Department Report 2025

This report summarizes the work of every department at Northwind Robotics during fiscal year 2025. Each section is written by a different team and is intended to be read independently.

## Section 1: Executive Summary

Northwind Robotics closed fiscal year 2025 with revenue of $48.2 million, a 23% increase over 2024. The company shipped 1,340 warehouse robots, up from 1,020 the year before. Headcount grew from 212 to 267 employees.

The three priorities for the year were: launching the Atlas-3 picking arm, reducing field failures, and opening a second assembly line in Da Nang. All three were completed, although the Da Nang line opened eleven weeks later than planned.

The largest risk going into 2026 is supplier concentration: 71% of our servo motors come from a single vendor, Kestrel Drives.

## Section 2: Hardware Engineering

The Atlas-3 picking arm entered mass production in March. It has six degrees of freedom, a maximum payload of 12 kg, and a reach of 1.4 meters. Compared to Atlas-2, cycle time dropped from 4.1 seconds to 2.9 seconds per pick.

The most serious hardware problem of the year was incident INC-2025-0417, in which gripper actuators overheated after roughly 900 hours of continuous operation. The root cause was an undersized heat sink on the wrist motor driver. A redesigned heat sink (part number HS-7741-B) was rolled out in July and no recurrence has been reported since.

Battery packs moved from NMC to LFP chemistry. The change reduced energy density by 14% but increased rated cycle life from 1,500 to 4,000 cycles and removed the need for active liquid cooling.

## Section 3: Software Engineering

The fleet control platform, internally called Conductor, was migrated from a monolith to nine services. Median API latency fell from 310 ms to 85 ms, and deployment frequency rose from twice a month to eleven times a week.

Path planning switched from A* on a fixed grid to a hybrid planner that combines a lattice search with local trajectory optimization. In customer warehouses this reduced robot-to-robot deadlocks by 62%.

Error code ERR_NAV_203 ("localization confidence below threshold") was the single most frequently logged fault, accounting for 31% of all navigation errors. It is almost always triggered by reflective floor tape confusing the lidar. A firmware filter shipped in version 4.8.2 cut its occurrence by roughly half.

The team also resolved a memory leak in the telemetry agent, tracked as BUG-9912, which had caused robots to reboot after about 19 days of uptime.

## Section 4: Machine Learning Research

The vision team trained a new grasp-prediction model, GraspNet-V, on 2.3 million labeled picks. Grasp success rate on previously unseen items improved from 87.4% to 94.1%.

Inference runs on an onboard Jetson Orin module at 38 frames per second. Quantizing the model to 8-bit integers cost 0.6 percentage points of accuracy while doubling throughput.

A study on sim-to-real transfer found that randomizing lighting and surface texture in simulation mattered far more than randomizing object mass. Models trained with texture randomization needed 70% fewer real-world samples to reach the same performance.

The team's main open problem is transparent and reflective packaging, where grasp success is still only 71%.

## Section 5: Manufacturing and Supply Chain

The Da Nang assembly line began production on September 22, eleven weeks behind the original July 7 target. The delay was caused by late delivery of the calibration rigs and a customs hold on torque sensors.

By year end the Da Nang line produced 46 robots per week, compared with 61 per week at the original Ho Chi Minh City line. First-pass yield was 91.3% in Da Nang and 96.8% in Ho Chi Minh City.

Kestrel Drives supplies 71% of servo motors. A second supplier, Orbis Motion, was qualified in November and is expected to cover 30% of volume by mid-2026. Lead time for servo motors averaged 14 weeks during the year, peaking at 22 weeks in May.

## Section 6: Finance

Revenue was $48.2 million, split into $36.9 million from hardware sales and $11.3 million from software subscriptions and service contracts. Subscription revenue grew 58% year over year and now represents 23% of total revenue.

Gross margin improved from 34% to 39%, mostly because of the lower bill of materials on Atlas-3. Operating expenses were $21.7 million, of which research and development accounted for $9.4 million.

The company ended the year with $17.6 million in cash and no outstanding debt. Capital expenditure for the Da Nang line totaled $6.1 million, $0.8 million over budget.

## Section 7: Customer Support

The support team handled 8,912 tickets, down 9% from 2024 despite a larger installed base. Median first-response time was 42 minutes and median time to resolution was 6.5 hours.

The top three ticket categories were navigation faults (28%), gripper issues (19%), and charging dock alignment (13%). Tickets about gripper overheating dropped by 84% after the fix for incident INC-2025-0417 was deployed.

Customer satisfaction, measured by post-ticket survey, averaged 4.5 out of 5. Net Promoter Score rose from 41 to 52.

## Section 8: Legal and Compliance

Northwind Robotics obtained CE marking for Atlas-3 in February and completed ISO 10218-1 safety certification in June. An ISO 27001 audit of the Conductor platform finished in October with two minor non-conformities, both closed within 30 days.

Four patents were granted during the year, including one covering the hybrid path planner described in the software section. Nine further applications are pending.

One contract dispute with a former distributor in Thailand was settled in August for $240,000. No regulatory fines were incurred.

## Section 9: People and Culture

Headcount grew from 212 to 267. Voluntary attrition was 8.4%, below the 12% industry benchmark. Engineering roles make up 58% of the workforce.

The company introduced a four-week paid sabbatical for employees with five or more years of tenure; 14 people used it in the first year. The annual engagement survey had a 91% response rate and an overall score of 78 out of 100.

The lowest-scoring survey item was "I have enough time for deep work," which scored 54. In response, the engineering organization adopted meeting-free Wednesdays starting in November.

## Section 10: Outlook for 2026

The revenue target for 2026 is $62 million. Planned milestones are the launch of Atlas-4 with a 20 kg payload in the third quarter, raising Da Nang output to 80 robots per week, and bringing subscription revenue above 30% of total revenue.

The research priority is solving grasping of transparent packaging. The operational priority is reducing dependence on Kestrel Drives to below 50% of servo motor volume.
